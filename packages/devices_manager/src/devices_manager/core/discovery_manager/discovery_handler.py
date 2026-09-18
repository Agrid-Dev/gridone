from __future__ import annotations

import asyncio
import contextlib
import hashlib
import logging
from collections.abc import Callable, Coroutine
from typing import TYPE_CHECKING, Any

from devices_manager.core.device import CoreDevice, DeviceBase
from devices_manager.core.transports import PushTransportClient
from devices_manager.core.utils.templating.render import render_struct
from models.ids import gen_id

if TYPE_CHECKING:
    from devices_manager.core.driver import DiscoveryListener, Driver
    from devices_manager.core.transports import TransportClient
    from devices_manager.types import AttributeValueType, DeviceConfig

logger = logging.getLogger(__name__)


def _hash_config(device_config: DeviceConfig) -> str:
    return hashlib.sha256(str(device_config).encode("utf-8")).hexdigest()


type DiscoveryCallback = Callable[[CoreDevice], Coroutine[Any, Any, None]]


class DiscoveryHandler:
    discovery_listener: DiscoveryListener
    driver: Driver
    transport: PushTransportClient
    on_discover: DiscoveryCallback
    _transport_listener_id: str | None

    def __init__(
        self,
        driver: Driver,
        transport: TransportClient,
        on_discover: DiscoveryCallback,
    ) -> None:
        if not isinstance(transport, PushTransportClient):
            msg = "Can only use Push Transport Clients for discovery"
            raise TypeError(msg)
        self.transport = transport
        discovery_listener = driver.discovery_listener
        if not discovery_listener:
            msg = f"Driver {driver.metadata.id} does not support discovery"
            raise TypeError(msg)
        self.driver = driver
        self.discovery_listener = discovery_listener
        self.on_discover = on_discover
        self._transport_listener_id = None

    def try_parsing_attributes(self, payload: Any) -> dict[str, AttributeValueType]:  # noqa: ANN401
        attributes = {}

        for attribute_name, attribute_driver in self.driver.attributes.items():
            with contextlib.suppress(Exception):
                value = attribute_driver.codec.decode(payload)
                if value is not None:
                    attributes[attribute_name] = value
        return attributes

    @staticmethod
    def try_parsing_name(config: DeviceConfig) -> str:
        """If there is a device config, build a name from its values"""
        config_values: list[str] = []
        if isinstance(config, dict) and len(config):
            for v in config.values():
                with contextlib.suppress(Exception):
                    config_values.append(str(v))
        return "/".join(config_values)

    async def try_reading_name(self, config: DeviceConfig) -> str | None:
        """Read the driver's discovery ``name_attribute`` once, straight
        through the transport: the device does not exist yet, so nothing is
        recorded against its connection status. ``None`` (no declaration,
        transport or decode failure, non-string or blank value) leaves the
        config-based fallback name in place."""
        attribute_name = self.discovery_listener.name_attribute
        if attribute_name is None:
            return None
        attribute_driver = self.driver.attributes[attribute_name]
        context = {**self.driver.env, **config}
        try:
            address = self.transport.build_address(
                render_struct(attribute_driver.read, context), context
            )
            value = attribute_driver.codec.decode(await self.transport.read(address))
        except Exception as e:  # noqa: BLE001
            logger.info(
                "Discovery: could not read %s for %s, keeping the config-based "
                "name — %s: %s",
                attribute_name,
                config,
                type(e).__name__,
                e,
            )
            return None
        if not isinstance(value, str) or not value.strip():
            return None
        return value.strip()

    async def _discover(self, device_config: DeviceConfig, payload: Any) -> None:  # noqa: ANN401
        name = await self.try_reading_name(device_config) or self.try_parsing_name(
            device_config
        )
        device = CoreDevice.from_base(
            DeviceBase(id=gen_id(), name=name, config=device_config),
            transport=self.transport,
            driver=self.driver,
            initial_values=self.try_parsing_attributes(payload),
        )
        await self.on_discover(device)

    async def start(self) -> None:
        seen: set[str] = set()

        def handle_payload(payload: Any) -> None:  # noqa: ANN401
            nonlocal seen
            device_config: DeviceConfig = self.discovery_listener.parse(payload)
            config_hash = _hash_config(device_config)
            if config_hash in seen:
                return
            # Marked before the task runs: the name read can take seconds and
            # the same device keeps publishing meanwhile.
            seen.add(config_hash)
            asyncio.create_task(self._discover(device_config, payload))  # noqa: RUF006 # @TODO: make listeners async

        self._transport_listener_id = await self.transport.register_listener(
            self.transport.build_address(self.discovery_listener.topic),
            handle_payload,
        )

    async def stop(self) -> None:
        if not self._transport_listener_id:
            msg = "Miss a listener id to unregister"
            raise ValueError(msg)
        await self.transport.unregister_listener(
            self._transport_listener_id, self.discovery_listener.topic
        )
