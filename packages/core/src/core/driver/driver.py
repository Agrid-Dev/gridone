import asyncio
import contextlib
import hashlib
import logging
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from core.transports import PushTransportClient
from core.types import AttributeValueType, DeviceConfig
from core.value_adapters import build_value_adapter

from .discovery_listener import DiscoveryListener
from .driver_schema import DriverSchema

logger = logging.getLogger(__name__)


@dataclass
class Driver:
    name: str
    env: dict
    schema: DriverSchema

    async def discover(
        self,
        transport: PushTransportClient,
        on_discover: Callable[[DeviceConfig, dict[str, AttributeValueType]], None],
        *,
        timeout: float = 30.0,  # noqa: ASYNC109
    ) -> None:
        """Start listening for device discovery messages.

        Args:
            transport: a PushTransportClient (that supports listeners)
            on_discover: A Callback on device config
            and set of initial attributes (if available).
        """

        seen: set[str] = set()
        logger.debug("Starting discovery for driver '%s'", self.name)
        if self.schema.discovery is None:
            msg = f"Driver '{self.name}' does not have discovery configuration"
            raise ValueError(msg)

        if not isinstance(transport, PushTransportClient):
            msg = "Need a push transport client for discovery"
            raise TypeError(msg)

        # Render discovery listen configuration
        discovery_schema = self.schema.discovery
        discovery_listener = DiscoveryListener.from_dict(discovery_schema)

        def callback(payload: Any) -> None:  # noqa: ANN401
            nonlocal seen
            device_config: DeviceConfig = discovery_listener.parse(payload)
            config_hash = hashlib.sha256(str(device_config).encode("utf-8")).hexdigest()
            if config_hash in seen:
                return
            parsed_attributes = {}
            # try to parse attributes initial values if some are in the payload
            for attribute_schema in self.schema.attribute_schemas:
                adapter = build_value_adapter(attribute_schema.value_adapter)
                with contextlib.suppress(Exception):
                    parsed_attributes[attribute_schema.name] = adapter.decode(payload)

            on_discover(device_config, parsed_attributes)
            seen.add(config_hash)

        listener_id = await transport.register_listener(
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
            await transport.unregister_listener(listener_id, discovery_listener.topic)
            logger.debug("Discovery listener unregistered for driver '%s'", self.name)

    @classmethod
    def from_dict(cls, data: dict) -> "Driver":
        driver_env_raw = data.get("env", {})
        driver_env = driver_env_raw if isinstance(driver_env_raw, dict) else {}
        return cls(
            name=data.get("name", ""),
            env=driver_env,
            schema=DriverSchema.from_dict(data),
        )
