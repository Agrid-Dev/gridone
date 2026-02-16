import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import TypedDict

from devices_manager.core.device import Device
from devices_manager.core.driver import Driver
from devices_manager.core.transports import TransportClient

from .discovery_handler import DiscoveryHandler

logger = logging.getLogger(__name__)


class DiscoveryConfig(TypedDict):
    driver_id: str
    transport_id: str


@dataclass
class DiscoveryContext:
    get_driver: Callable[[str], Driver]
    get_transport: Callable[[str], TransportClient]
    device_exists: Callable[[Device], bool]
    add_device: Callable[[Device], Awaitable[None]]


class DevicesDiscoveryManager:
    """Discovery manager handles registering listeners
    to Push transport clients to discover new devices.
    When discovering a new device, it fires a callback supplied
    by its client (devices manager).
    Only one discovery is supported per driver/transport pair."""

    _context: DiscoveryContext
    _registry: dict[
        tuple[str, str], DiscoveryHandler
    ]  # keys: (driver_id, transport_id)

    def __init__(self, context: DiscoveryContext) -> None:
        self._registry = {}
        self._context = context

    def _build_key(self, driver_id: str, transport_id: str) -> tuple[str, str]:
        return (driver_id, transport_id)

    def _unpack_key(self, key: tuple[str, str]) -> DiscoveryConfig:
        driver_id, transport_id = key
        return {"driver_id": driver_id, "transport_id": transport_id}

    async def register(self, driver_id: str, transport_id: str) -> None:
        """Registers a new DiscoveryHandler for the driver/transport pair.
        Only one discovery is supported per driver/transport pair."""
        if self.has(driver_id=driver_id, transport_id=transport_id):
            msg = "Discovery already registered for this driver/transport"
            raise ValueError(msg)

        try:
            driver = self._context.get_driver(driver_id)
        except KeyError as e:
            msg = f"Driver not found {driver_id}"
            raise KeyError(msg) from e
        try:
            transport = self._context.get_transport(transport_id)
        except KeyError as e:
            msg = f"Transport not found {transport_id}"
            raise KeyError(msg) from e

        async def on_discover(device: Device) -> None:
            logger.info(
                "Discovered device %s with config %s on driver %s x transport %s",
                device.id,
                device.config,
                driver_id,
                transport_id,
            )
            if not self._context.device_exists(device):
                await self._context.add_device(device)
                logger.info("Added device %s to context", device.id)

            logger.info("Device %s already exists in context", device.id)

        job = DiscoveryHandler(driver, transport, on_discover)
        await job.start()
        key = self._build_key(driver.metadata.id, transport.id)
        self._registry[key] = job
        logger.info(
            "Registered discovery for driver %s and transport %s",
            driver.metadata.id,
            transport.id,
        )

    async def unregister(self, driver_id: str, transport_id: str) -> None:
        key = self._build_key(driver_id, transport_id)
        job = self._registry[(driver_id, transport_id)]
        await job.stop()
        del self._registry[key]
        logger.info(
            "Unregistered discovery for driver %s and transport %s",
            driver_id,
            transport_id,
        )

    def list(
        self, *, driver_id: str | None = None, transport_id: str | None = None
    ) -> list[DiscoveryConfig]:
        unpacked_keys = [self._unpack_key(key) for key in self._registry]

        def matches_filters(d: DiscoveryConfig) -> bool:
            return (driver_id is None or d["driver_id"] == driver_id) and (
                transport_id is None or d["transport_id"] == transport_id
            )

        return [d for d in unpacked_keys if matches_filters(d)]

    def has(self, driver_id: str, transport_id: str) -> bool:
        return (
            self._build_key(driver_id=driver_id, transport_id=transport_id)
            in self._registry
        )
