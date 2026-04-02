import asyncpg

from devices_manager.dto import DeviceDTO, DriverDTO, TransportDTO
from devices_manager.storage.storage_backend import (
    AttributeStorageBackend,
    DevicesManagerStorage,
    StorageBackend,
)

from .device_storage import PostgresDeviceStorage
from .driver_storage import PostgresDriverStorage
from .transport_storage import PostgresTransportStorage


class PostgresDevicesManagerStorage(DevicesManagerStorage):
    _pool: asyncpg.Pool
    devices: StorageBackend[DeviceDTO]
    drivers: StorageBackend[DriverDTO]
    transports: StorageBackend[TransportDTO]
    attributes: AttributeStorageBackend

    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool
        device_storage = PostgresDeviceStorage(pool)
        self.devices = device_storage
        self.drivers = PostgresDriverStorage(pool)
        self.transports = PostgresTransportStorage(pool)
        self.attributes = device_storage

    @classmethod
    async def from_url(cls, url: str) -> "PostgresDevicesManagerStorage":
        pool = await asyncpg.create_pool(dsn=url)
        return cls(pool)

    async def close(self) -> None:
        await self._pool.close()
