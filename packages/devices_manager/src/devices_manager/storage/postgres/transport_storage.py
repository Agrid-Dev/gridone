from __future__ import annotations

from typing import TYPE_CHECKING

from devices_manager.core.transports import TransportConnectionState
from devices_manager.dto.transport_dto import (
    Transport,
    build_dto,
)
from devices_manager.storage.storage_backend import StorageBackend

if TYPE_CHECKING:
    import asyncpg


class PostgresTransportStorage(StorageBackend[Transport]):
    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    @staticmethod
    def _row_to_dto(row: asyncpg.Record) -> Transport:
        return build_dto(
            transport_id=row["id"],
            name=row["name"],
            protocol=row["protocol"],
            config=row["config"],
            connection_state=TransportConnectionState.from_dict(
                row["connection_state"]
            ),
        )

    async def read(self, item_id: str) -> Transport:
        row = await self._pool.fetchrow(
            "SELECT id, name, protocol, config, connection_state "
            "FROM dm_transports WHERE id = $1",
            item_id,
        )
        if row is None:
            msg = f"dm_transports entry '{item_id}' not found"
            raise FileNotFoundError(msg)
        return self._row_to_dto(row)

    async def write(self, item_id: str, data: Transport) -> None:
        dumped = data.model_dump(mode="json")
        await self._pool.execute(
            "INSERT INTO dm_transports "
            "(id, name, protocol, config, connection_state) "
            "VALUES ($1, $2, $3, $4, $5) "
            "ON CONFLICT (id) DO UPDATE SET "
            "name = EXCLUDED.name, protocol = EXCLUDED.protocol, "
            "config = EXCLUDED.config, "
            "connection_state = EXCLUDED.connection_state",
            item_id,
            dumped["name"],
            dumped["protocol"],
            dumped["config"],
            dumped.get("connection_state", {}),
        )

    async def read_all(self) -> list[Transport]:
        rows = await self._pool.fetch(
            "SELECT id, name, protocol, config, connection_state "
            "FROM dm_transports ORDER BY id",
        )
        return [self._row_to_dto(row) for row in rows]

    async def list_all(self) -> list[str]:
        rows = await self._pool.fetch("SELECT id FROM dm_transports ORDER BY id")
        return [row["id"] for row in rows]

    async def delete(self, item_id: str) -> None:
        result = await self._pool.execute(
            "DELETE FROM dm_transports WHERE id = $1", item_id
        )
        if result == "DELETE 0":
            msg = f"dm_transports entry '{item_id}' not found"
            raise FileNotFoundError(msg)
