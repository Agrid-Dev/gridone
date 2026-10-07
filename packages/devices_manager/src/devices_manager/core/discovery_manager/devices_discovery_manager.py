from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING, TypedDict

from .discovery_handler import DiscoveryHandler

if TYPE_CHECKING:
    import builtins
    from collections.abc import Awaitable, Callable

    from devices_manager.core.device import CoreDevice
    from devices_manager.core.driver import Driver
    from devices_manager.core.transports import TransportClient

    from .storage_port import DiscoveryStorage

logger = logging.getLogger(__name__)


class DiscoveryConfig(TypedDict):
    driver_id: str
    transport_id: str


@dataclass
class DiscoveryContext:
    get_driver: Callable[[str], Driver]
    get_transport: Callable[[str], TransportClient]
    device_exists: Callable[[CoreDevice], bool]
    add_device: Callable[[CoreDevice], Awaitable[None]]


class DevicesDiscoveryManager:
    """Discovery manager handles registering listeners
    to Push transport clients to discover new devices.
    When discovering a new device, it fires a callback supplied
    by its client (devices manager).
    Only one discovery is supported per driver/transport pair.

    A registered discovery stays registered while it is not listening (its
    restore failed), so it can still be unregistered and still holds its
    driver and transport."""

    _context: DiscoveryContext
    _storage: DiscoveryStorage
    # None: registered, not listening.
    _registry: dict[tuple[str, str], DiscoveryHandler | None]

    def __init__(self, context: DiscoveryContext, storage: DiscoveryStorage) -> None:
        self._registry = {}
        self._context = context
        self._storage = storage

    def _build_key(self, driver_id: str, transport_id: str) -> tuple[str, str]:
        return (driver_id, transport_id)

    def _unpack_key(self, key: tuple[str, str]) -> DiscoveryConfig:
        driver_id, transport_id = key
        return {"driver_id": driver_id, "transport_id": transport_id}

    async def register(self, driver_id: str, transport_id: str) -> None:
        """Start and store the pair. Registering an idle pair again retries its
        start. Only one discovery is supported per driver/transport pair."""
        key = self._build_key(driver_id, transport_id)
        if self._registry.get(key) is not None:
            msg = "Discovery already registered for this driver/transport"
            raise ValueError(msg)
        self._registry[key] = await self._start_and_store(key)
        logger.info(
            "Registered discovery for driver %s and transport %s",
            driver_id,
            transport_id,
        )

    async def _start_and_store(self, key: tuple[str, str]) -> DiscoveryHandler:
        """Listen first, then persist; a failed write must not leave a listener
        armed."""
        job = await self._start(*key)
        try:
            await self._storage.write(self._unpack_key(key))
        except BaseException:
            await job.stop()
            raise
        return job

    async def restore(self) -> None:
        """Restart the stored discoveries. One that can't start is logged and
        skipped, and stays stored for the next boot."""
        try:
            configs = await self._storage.read_all()
        except Exception:
            logger.exception("Could not read the stored discoveries")
            return
        for config in configs:
            await self._restore_one(self._build_key(**config))

    async def _restore_one(self, key: tuple[str, str]) -> None:
        """A start failure leaves the pair registered but idle, for the next
        boot or a re-register."""
        if self._registry.get(key) is not None:
            return
        try:
            self._registry[key] = await self._start(*key)
        except Exception:
            self._registry[key] = None
            logger.exception("Could not restore discovery %s", self._unpack_key(key))

    async def _start(self, driver_id: str, transport_id: str) -> DiscoveryHandler:
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

        async def on_discover(device: CoreDevice) -> None:
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
            else:
                logger.info("Device %s already exists in context", device.id)

        job = DiscoveryHandler(driver, transport, on_discover)
        await job.start()
        return job

    async def unregister(self, driver_id: str, transport_id: str) -> None:
        """Stop the discovery if it listens, then drop it from storage. A
        failed stop leaves it registered and stored, so it can be retried."""
        key = self._build_key(driver_id, transport_id)
        job = self._registry[key]
        if job is not None:
            self._registry[key] = None
            await job.stop()
        await self._storage.delete(self._unpack_key(key))
        del self._registry[key]
        logger.info(
            "Unregistered discovery for driver %s and transport %s",
            driver_id,
            transport_id,
        )

    def list(
        self, *, driver_id: str | None = None, transport_id: str | None = None
    ) -> builtins.list[DiscoveryConfig]:
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
