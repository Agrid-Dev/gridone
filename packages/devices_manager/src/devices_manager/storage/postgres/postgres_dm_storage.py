from typing import Any

import asyncpg

from devices_manager.dto import DeviceDTO, DriverDTO, TransportDTO
from devices_manager.dto.transport_dto import (
    DEFAULT_CONNECTION_STATE,
)
from devices_manager.dto.transport_dto import (
    build_dto as build_transport_dto,
)
from devices_manager.storage.storage_backend import DevicesManagerStorage

from .postgres_storage import PostgresStorageBackend


class PostgresDevicesManagerStorage(DevicesManagerStorage):
    _pool: asyncpg.Pool
    devices: PostgresStorageBackend[DeviceDTO]
    drivers: PostgresStorageBackend[DriverDTO]
    transports: PostgresStorageBackend[TransportDTO]

    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool
        self.devices = PostgresStorageBackend[DeviceDTO](
            table_name="dm_devices",
            pool=pool,
            deserializer=DeviceDTO.model_validate,
        )
        self.drivers = PostgresStorageBackend[DriverDTO](
            table_name="dm_drivers",
            pool=pool,
            deserializer=DriverDTO.model_validate,
        )
        self.transports = PostgresStorageBackend[TransportDTO](
            table_name="dm_transports",
            pool=pool,
            deserializer=self._deserialize_transport,
        )

    @classmethod
    async def from_url(cls, url: str) -> "PostgresDevicesManagerStorage":
        pool = await asyncpg.create_pool(dsn=url)
        storage = cls(pool)
        await storage.ensure_schema()
        return storage

    @staticmethod
    def _deserialize_transport(data: dict[str, Any]) -> TransportDTO:
        return build_transport_dto(
            transport_id=data["id"],
            name=data.get("name", ""),
            protocol=data["protocol"],
            config=data.get("config", {}),
            connection_state=data.get("connection_state", DEFAULT_CONNECTION_STATE),
        )

    async def ensure_schema(self) -> None:
        statements = (
            """
            CREATE TABLE IF NOT EXISTS dm_devices (
                id TEXT PRIMARY KEY,
                data JSONB NOT NULL
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS dm_drivers (
                id TEXT PRIMARY KEY,
                data JSONB NOT NULL
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS dm_transports (
                id TEXT PRIMARY KEY,
                data JSONB NOT NULL
            )
            """,
        )
        async with self._pool.acquire() as connection, connection.transaction():
            for statement in statements:
                await connection.execute(statement)

    async def close(self) -> None:
        await self._pool.close()
