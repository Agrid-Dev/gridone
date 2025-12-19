import asyncio
import contextlib
import hashlib
import logging
from collections.abc import Callable
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from core.transports import PushTransportClient, TransportClient
from core.types import AttributeValueType, DeviceConfig
from core.value_adapters import build_value_adapter

from .discovery_listener import DiscoveryListener
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

    async def discover(
        self,
        on_discover: Callable[[DeviceConfig, dict[str, AttributeValueType]], None],
        *,
        timeout: float = 30.0,  # noqa: ASYNC109
    ) -> None:
        """Start listening for device discovery messages.

        Args:
            on_discover: A Callback on device config
            and set of initial attributes (if available).
        """

        seen: set[str] = set()
        logger.debug("Starting discovery for driver '%s'", self.name)
        if self.schema.discovery is None:
            msg = f"Driver '{self.name}' does not have discovery configuration"
            raise ValueError(msg)

        if not isinstance(self.transport, PushTransportClient):
            msg = "Need a push transport client for discovery"
            raise TypeError(msg)

        # Render discovery listen configuration
        discovery_schema = self.schema.discovery
        discovery_listener = DiscoveryListener.from_dict(discovery_schema)

        def callback(payload: Any) -> None:  # noqa: ANN401
            nonlocal seen
            device_config: DeviceConfig = discovery_listener.parse(payload)
            config_hash = hashlib.sha256(device_config)
            if config_hash in seen:
                return
            parsed_attributes = {}
            # try to parse attributes initial values if some are in the payload
            for attribute_schema in self.schema.attribute_schemas:
                adapter = build_value_adapter(attribute_schema.value_adapter)
                with contextlib.suppress(Exception):
                    parsed_attributes[attribute_schema.name] = adapter.decode(payload)

            on_discover(device_config, parsed_attributes)

        listener_id = await self.transport.register_listener(
            discovery_listener.topic, callback
        )
        try:
            async with asyncio.timeout(timeout):
                await asyncio.Future()
        except (TimeoutError, asyncio.CancelledError) as e:
            logger.debug(
                "Discovery stopped: %s",
                "timeout" if isinstance(e, asyncio.TimeoutError) else "cancelled",
            )
        finally:
            await self.transport.unregister_listener(
                listener_id, discovery_listener.topic
            )
            logger.debug("Discovery listener unregistered for driver '%s'", self.name)

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
