import json
import logging
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from core.transports import TransportClient
from core.types import AttributeValueType, DeviceConfig
from core.utils.templating.render import render_struct
from core.value_adapters import build_value_adapter

from .driver_schema import DriverSchema

if TYPE_CHECKING:
    from .driver_schema.attribute_schema import AttributeSchema

logger = logging.getLogger(__name__)


@dataclass
class Driver:
    name: str
    env: dict
    transport: TransportClient
    schema: DriverSchema
    _discovery_handler_id: str | None = field(default=None, init=False, repr=False)

    def attach_updater(
        self,
        attribute_name: str,
        device_config: DeviceConfig,
        callback: Callable[[AttributeValueType], None],
    ) -> None:
        context = {**device_config, **self.env}
        try:
            attribute_schema = next(
                a for a in self.schema.attribute_schemas if a.name == attribute_name
            ).render(context)
        except StopIteration as e:
            msg = f"Attribute {attribute_name} is not supported"
            raise ValueError(msg) from e
        address = self.transport.build_address(attribute_schema.read, context)
        adapter = build_value_adapter(attribute_schema.value_adapter)

        self.transport.register_read_handler(
            address, lambda v: callback(adapter.decode(v))
        )

    async def read_value(
        self,
        attribute_name: str,
        device_config: DeviceConfig,
    ) -> AttributeValueType:
        context = {**device_config, **self.env}
        attribute_schema = self.schema.get_attribute_schema(
            attribute_name=attribute_name,
        ).render(context)
        adapter = build_value_adapter(attribute_schema.value_adapter)
        address = self.transport.build_address(attribute_schema.read, context)
        raw_value = await self.transport.read(address)
        return adapter.decode(raw_value)

    async def write_value(
        self,
        attribute_name: str,
        device_config: DeviceConfig,
        value: AttributeValueType,
    ) -> None:
        context = {**device_config, **self.env, "value": value}
        attribute_schema: AttributeSchema = self.schema.get_attribute_schema(
            attribute_name=attribute_name,
        ).render(context)
        if attribute_schema.write is None:
            msg = f"Attribute '{attribute_name}' is not writable"
            raise ValueError(msg)
        adapter = build_value_adapter(attribute_schema.value_adapter)
        address = self.transport.build_address(attribute_schema.write, context)
        await self.transport.write(
            address=address,
            value=adapter.encode(value),
        )

    def start_discovery(self, device_config: DeviceConfig | None = None) -> None:
        """Start listening for device discovery messages.

        Args:
            device_config: Optional device configuration for templating discovery topic.
                          If None, uses only driver env for templating.
        """
        print("starting discovery")
        if self.schema.discovery is None:
            msg = f"Driver '{self.name}' does not have discovery configuration"
            raise ValueError(msg)

        if self._discovery_handler_id is not None:
            logger.warning("Discovery already started for driver '%s'", self.name)
            return

        # Build context for templating
        context = {**(device_config or {}), **self.env}

        # Render discovery listen configuration
        discovery_listen = self.schema.discovery.listen
        rendered_topic = render_struct(
            discovery_listen.topic,
            context,
            raise_for_missing_context=True,
        )

        # Build MQTT address for discovery topic
        # MQTT addresses require both topic and request, but for passive discovery
        # we only listen, so we provide a minimal request structure
        discovery_address = self.transport.build_address(
            {
                "topic": rendered_topic,
                "request": {
                    "topic": "",
                    "message": "",
                },  # Dummy request for listening only
            },
            context,
        )

        # Create discovery handler
        def discovery_handler(message: str) -> None:
            try:
                self._handle_discovery_message(message, context)
            except Exception as e:  # noqa: BLE001
                logger.error(
                    "Error handling discovery message for driver '%s': %s",
                    self.name,
                    e,
                    exc_info=True,
                )

        # Register handler
        self._discovery_handler_id = self.transport.register_read_handler(
            discovery_address, discovery_handler
        )
        logger.info(
            "Started discovery for driver '%s' on topic '%s'",
            self.name,
            rendered_topic,
        )

    def stop_discovery(self) -> None:
        """Stop listening for device discovery messages."""
        if self._discovery_handler_id is None:
            logger.warning("Discovery not started for driver '%s'", self.name)
            return

        if self.schema.discovery is None:
            return

        # Build context for templating
        context = {**self.env}

        # Render discovery listen configuration to get the address
        discovery_listen = self.schema.discovery.listen
        rendered_topic = render_struct(
            discovery_listen.topic,
            context,
            raise_for_missing_context=True,
        )

        # Build MQTT address for discovery topic
        discovery_address = self.transport.build_address(
            {
                "topic": rendered_topic,
                "request": {
                    "topic": "",
                    "message": "",
                },  # Dummy request for listening only
            },
            context,
        )

        # Unregister handler
        self.transport.unregister_read_handler(
            self._discovery_handler_id, discovery_address
        )
        self._discovery_handler_id = None
        logger.info("Stopped discovery for driver '%s'", self.name)

    def _handle_discovery_message(self, message: str, context: dict) -> None:
        """Handle an incoming discovery message.

        Args:
            message: Raw message string (expected to be JSON)
            context: Context dictionary for templating
        """
        print(f"Handling discovery message: {message}")
        if self.schema.discovery is None:
            return

        # Parse JSON message
        try:
            message_data = json.loads(message)
        except json.JSONDecodeError as e:
            logger.warning(
                "Failed to parse discovery message as JSON for driver '%s': %s",
                self.name,
                e,
            )
            return

        # Extract device information using configured parsers
        discovered_fields: dict[str, AttributeValueType] = {}
        for parser_name, parser_config in self.schema.discovery.parsers.items():
            try:
                # Get the value adapter spec for this parser
                adapter_spec = self.schema.discovery.get_parser_adapter(parser_name)
                # Build the adapter
                adapter = build_value_adapter([adapter_spec])
                # Extract the value from the message
                value = adapter.decode(message_data)
                discovered_fields[parser_name] = value
            except Exception as e:  # noqa: BLE001
                logger.warning(
                    "Failed to extract '%s' from discovery message for driver '%s': %s",
                    parser_name,
                    self.name,
                    e,
                )
                # Continue with other parsers even if one fails
                continue

        # Validate that we have at least a device_id
        if "device_id" not in discovered_fields:
            logger.warning(
                "Discovery message for driver '%s' missing required 'device_id' field",
                self.name,
            )
            return

        # Log discovered device
        device_id = discovered_fields["device_id"]
        print(
            "Discovered device for driver '%s': device_id=%s, fields=%s",
            self.name,
            device_id,
            discovered_fields,
        )

    @classmethod
    def from_dict(cls, data: dict, transport_client: TransportClient) -> "Driver":
        transport = data.get("transport")
        if transport is None or transport != transport_client.protocol:
            msg = (
                f"Expected a {transport} transport but got {transport_client.protocol}"
            )
            raise ValueError(msg)
        driver_env_raw = data.get("env", {})
        driver_env = driver_env_raw if isinstance(driver_env_raw, dict) else {}

        return cls(
            name=data.get("name", ""),
            env=driver_env,
            transport=transport_client,
            schema=DriverSchema.from_dict(data),
        )
