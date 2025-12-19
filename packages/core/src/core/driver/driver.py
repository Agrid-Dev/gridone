import json
import logging
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from core.transports import PushTransportClient, TransportClient
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
    _discovery_callback: (
        Callable[[str, DeviceConfig, dict[str, AttributeValueType]], None] | None
    ) = field(default=None, init=False, repr=False)
    _discovery_device_config: DeviceConfig | None = field(
        default=None, init=False, repr=False
    )

    async def attach_update_listener(
        self,
        attribute_name: str,
        device_config: DeviceConfig,
        callback: Callable[[AttributeValueType], None],
    ) -> str:
        if isinstance(self.transport, PushTransportClient):
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
            return await self.transport.register_listener(
                address, lambda v: callback(adapter.decode(v))
            )
        msg = "Only push transports support listeners"
        raise NotImplementedError(msg)

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
        logger.debug("Starting discovery for driver '%s'", self.name)
        if self.schema.discovery is None:
            msg = f"Driver '{self.name}' does not have discovery configuration"
            raise ValueError(msg)

        if self._discovery_handler_id is not None:
            logger.warning("Discovery already started for driver '%s'", self.name)
            return

        # Build context for templating
        context = {**(device_config or {}), **self.env}

        # Store device_config for use when stopping discovery
        self._discovery_device_config = device_config

        # Render discovery listen configuration
        discovery_listen = self.schema.discovery.listen
        rendered_topic = render_struct(
            discovery_listen.topic,
            context,
            raise_for_missing_context=True,
        )

        # Create discovery handler
        def discovery_handler(message: str) -> None:
            try:
                self._handle_discovery_message(message, context)
            except Exception:
                logger.exception(
                    "Error handling discovery message for driver '%s'",
                    self.name,
                )

        # Subscribe to topic for passive listening
        self._discovery_handler_id = self.transport.register_listener(
            rendered_topic, discovery_handler
        )
        logger.info(
            "Started discovery for driver '%s' on topic '%s'",
            self.name,
            rendered_topic,
        )

    def set_discovery_callback(
        self,
        callback: Callable[[str, DeviceConfig, dict[str, AttributeValueType]], None],
    ) -> None:
        """Set a callback to be called when a device is discovered.

        Args:
            callback: Function called with (device_id, device_config,
                     discovered_attributes) when a device is discovered and
                     its attributes match the driver.
        """
        self._discovery_callback = callback

    def stop_discovery(self) -> None:
        """Stop listening for device discovery messages."""
        if not isinstance(self.transport, PushTransportClient):
            return
        if self._discovery_handler_id is None:
            logger.warning("Discovery not started for driver '%s'", self.name)
            return

        if self.schema.discovery is None:
            return

        # Build context for templating using stored device_config
        context = {**(self._discovery_device_config or {}), **self.env}

        # Render discovery listen configuration to get the topic
        discovery_listen = self.schema.discovery.listen
        rendered_topic = render_struct(
            discovery_listen.topic,
            context,
            raise_for_missing_context=True,
        )

        # Unsubscribe from topic
        self.transport.unregister_listener(self._discovery_handler_id, rendered_topic)
        self._discovery_handler_id = None
        self._discovery_device_config = None
        logger.info("Stopped discovery for driver '%s'", self.name)

    def _handle_discovery_message(self, message: str, context: dict) -> None:  # noqa: ARG002
        """Handle an incoming discovery message.

        Args:
            message: Raw message string (expected to be JSON)
            context: Context dictionary for templating
        """
        logger.debug("Handling discovery message: %s", message)
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
        for parser_name in self.schema.discovery.parsers:
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
        logger.debug("Discovered fields: %s", discovered_fields)
        # Validate that we have at least a device_id
        if "device_id" not in discovered_fields:
            logger.warning(
                "Discovery message for driver '%s' missing required 'device_id' field",
                self.name,
            )
            return

        device_id = discovered_fields["device_id"]

        # Extract attributes from discovery message payload
        discovered_attributes = self._extract_attributes_from_message(message_data)

        # Check if attributes match the driver's attribute schemas
        if not self._attributes_match(discovered_attributes):
            logger.debug(
                "Discovered device '%s' attributes do not match driver '%s' attributes",
                device_id,
                self.name,
            )
            return

        # Extract device_config fields from discovery message
        device_config = self._extract_device_config(message_data, discovered_fields)
        if device_config is None:
            logger.warning(
                "Failed to extract device_config for discovered device '%s'",
                device_id,
            )
            return

        # Log discovered device
        logger.info(
            "Discovered device for driver '%s': device_id=%s, config=%s, attributes=%s",
            self.name,
            device_id,
            device_config,
            discovered_attributes,
        )

        # Call discovery callback if set
        if self._discovery_callback:
            try:
                self._discovery_callback(
                    device_id, device_config, discovered_attributes
                )
            except Exception:
                logger.exception(
                    "Error in discovery callback for device '%s'",
                    device_id,
                )

    def _extract_attributes_from_message(
        self, message_data: dict
    ) -> dict[str, AttributeValueType]:
        """Extract attribute values from discovery message.

        Uses driver's attribute schemas to extract values from discovery
        message payload.

        Args:
            message_data: Parsed JSON message data

        Returns:
            Dictionary mapping attribute names to their values from message
        """
        discovered_attributes: dict[str, AttributeValueType] = {}

        for attribute_schema in self.schema.attribute_schemas:
            # Find json_pointer adapter in the attribute's value_adapter list
            json_pointer_spec = None
            for adapter_spec in attribute_schema.value_adapter:
                if adapter_spec.adapter == "json_pointer":
                    json_pointer_spec = adapter_spec
                    break

            if json_pointer_spec is None:
                # Skip attributes without json_pointer adapter
                continue

            try:
                # Build adapter and extract value from message
                adapter = build_value_adapter([json_pointer_spec])
                value = adapter.decode(message_data)
                # Only include non-None values
                if value is not None:
                    discovered_attributes[attribute_schema.name] = value
            except Exception:  # noqa: BLE001
                # Attribute not present in message, skip it
                logger.debug(
                    "Attribute '%s' not found in discovery message",
                    attribute_schema.name,
                )
                continue

        return discovered_attributes

    def _attributes_match(
        self, discovered_attributes: dict[str, AttributeValueType]
    ) -> bool:
        """Check if discovered attributes match driver's attribute schemas.

        Args:
            discovered_attributes: Dictionary of discovered attribute values

        Returns:
            True if at least one attribute matches, False otherwise
        """
        # Check if we found any attributes that match the driver's schema
        if not discovered_attributes:
            return False

        # Get attribute names from driver schema
        driver_attribute_names = {attr.name for attr in self.schema.attribute_schemas}

        # Check if at least one discovered attribute matches a driver attribute
        discovered_attribute_names = set(discovered_attributes.keys())
        matching_attributes = driver_attribute_names & discovered_attribute_names

        if not matching_attributes:
            return False

        logger.debug(
            "Found %d matching attributes: %s",
            len(matching_attributes),
            matching_attributes,
        )
        return True

    def _extract_device_config(
        self, message_data: dict, discovered_fields: dict[str, AttributeValueType]
    ) -> DeviceConfig | None:
        """Extract device_config fields from discovery message.

        Args:
            message_data: Parsed JSON message data
            discovered_fields: Fields extracted by discovery parsers

        Returns:
            DeviceConfig dictionary or None if extraction fails
        """
        device_config: DeviceConfig = {}

        # Extract device_config fields defined in driver schema
        for config_field in self.schema.device_config_fields:
            field_name = config_field.name

            # Try to extract from discovered_fields first (from parsers)
            if field_name in discovered_fields:
                device_config[field_name] = discovered_fields[field_name]
                continue

            # Try common field names in the message
            if field_name in message_data:
                device_config[field_name] = message_data[field_name]
            elif field_name in message_data.get("payload", {}):
                device_config[field_name] = message_data["payload"][field_name]
            elif config_field.required:
                # Required field not found
                logger.warning(
                    "Required device_config field '%s' not found in discovery message",
                    field_name,
                )
                return None

        return device_config

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
