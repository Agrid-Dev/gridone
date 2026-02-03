import asyncio
import contextlib
import hashlib
import logging
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from core.transports import PushTransportClient
from core.types import AttributeValueType, DeviceConfig, TransportProtocols

from .attribute_driver import AttributeDriver
from .device_config_field import DeviceConfigField
from .discovery_listener import DiscoveryListener
from .driver_metadata import DriverMetadata
from .update_strategy import UpdateStrategy

logger = logging.getLogger(__name__)


@dataclass
class Driver:
    metadata: DriverMetadata
    transport: TransportProtocols
    env: dict
    device_config_required: list[DeviceConfigField]
    update_strategy: UpdateStrategy
    attributes: dict[str, AttributeDriver]
    discovery_schema: dict | None = None

    @property
    def name(self) -> str:
        return self.metadata.name

    @property
    def id(self) -> str:
        return self.metadata.id

    @property
    def discovery_listener(self) -> DiscoveryListener | None:
        if self.discovery_schema:
            return DiscoveryListener.from_dict(self.discovery_schema)
        return None

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
        logger.debug("Starting discovery for driver '%s'", self.metadata.id)
        if self.discovery_schema is None:
            msg = f"Driver '{self.metadata.id}' does not have discovery configuration"
            raise ValueError(msg)

        if not isinstance(transport, PushTransportClient):
            msg = "Need a push transport client for discovery"
            raise TypeError(msg)

        # Render discovery listen configuration
        discovery_listener = DiscoveryListener.from_dict(self.discovery_schema)

        def callback(payload: Any) -> None:  # noqa: ANN401
            nonlocal seen
            device_config: DeviceConfig = discovery_listener.parse(payload)
            config_hash = hashlib.sha256(str(device_config).encode("utf-8")).hexdigest()
            if config_hash in seen:
                return
            parsed_attributes = {}
            # try to parse attributes initial values if some are in the payload
            for attribute_driver in self.attributes.values():
                adapter = attribute_driver.value_adapter
                with contextlib.suppress(Exception):
                    parsed_attributes[attribute_driver.name] = adapter.decode(payload)

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
            logger.debug(
                "Discovery listener unregistered for driver '%s'", self.metadata.id
            )

    @classmethod
    def from_dict(cls, data: dict) -> "Driver":
        """@deprecated
        (instanciation from exchange/storage models to be moved in dto)"""
        env = data.get("env")
        return cls(
            metadata=DriverMetadata(id=data["id"]),
            transport=TransportProtocols(data["transport"]),
            env=env or {},
            device_config_required=[
                DeviceConfigField(**field) for field in data.get("device_config", [])
            ],
            update_strategy=UpdateStrategy.model_validate(
                data.get("update_strategy", {})
            ),
            attributes={
                a["name"]: AttributeDriver.from_dict(a) for a in data["attributes"]
            },
        )
