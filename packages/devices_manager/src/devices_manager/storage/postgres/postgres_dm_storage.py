from __future__ import annotations

from typing import TYPE_CHECKING

import asyncpg

from devices_manager.storage.storage_backend import (
    DevicesManagerStorage,
    DeviceStorageBackend,
    StorageBackend,
)

from .device_storage import PostgresDeviceStorage
from .driver_storage import PostgresDriverStorage
from .transport_storage import PostgresTransportStorage

if TYPE_CHECKING:
    from devices_manager.core.device import Attribute
    from devices_manager.dto import DriverSpec, Transport


class PostgresDevicesManagerStorage(DevicesManagerStorage):
    _pool: asyncpg.Pool
    _device_storage: PostgresDeviceStorage
    devices: DeviceStorageBackend
    drivers: StorageBackend[DriverSpec]
    transports: StorageBackend[Transport]

    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool
        self._device_storage = PostgresDeviceStorage(pool)
        self.devices = self._device_storage
        self.drivers = PostgresDriverStorage(pool)
        self.transports = PostgresTransportStorage(pool)

    async def save_attribute(self, device_id: str, attribute: Attribute) -> None:
        """Persist a single attribute to the dm_device_attributes table."""
        await self._device_storage.save_attribute(device_id, attribute)

    @classmethod
    async def from_url(cls, url: str) -> PostgresDevicesManagerStorage:
        pool = await asyncpg.create_pool(dsn=url)
        return cls(pool)

    async def close(self) -> None:
        await self._pool.close()
