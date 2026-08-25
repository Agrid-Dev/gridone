from __future__ import annotations

from typing import TYPE_CHECKING

from devices_manager.storage.transport_record import (
    TransportRecord,
    from_record,
    to_record,
)

if TYPE_CHECKING:
    import asyncpg

    from devices_manager.core.transports import TransportClient


class PostgresTransportStorage:
    """``TransportStorage`` port over the dm_transports table."""

    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    @staticmethod
    def _row_to_client(row: asyncpg.Record) -> TransportClient:
        return from_record(
            TransportRecord(
                id=row["id"],
                name=row["name"],
                protocol=row["protocol"],
                config=row["config"],
                created_at=row["created_at"],
                updated_at=row["updated_at"],
            )
        )

    async def read(self, item_id: str) -> TransportClient:
        row = await self._pool.fetchrow(
            "SELECT id, name, protocol, config, created_at, updated_at "
            "FROM dm_transports WHERE id = $1",
            item_id,
        )
        if row is None:
            msg = f"dm_transports entry '{item_id}' not found"
            raise FileNotFoundError(msg)
        return self._row_to_client(row)

    async def write(self, item_id: str, client: TransportClient) -> None:
        record = to_record(client)
        dumped = record.model_dump(mode="json")
        await self._pool.execute(
            "INSERT INTO dm_transports "
            "(id, name, protocol, config, created_at, updated_at) "
            "VALUES ($1, $2, $3, $4, $5, $6) "
            "ON CONFLICT (id) DO UPDATE SET "
            "name = EXCLUDED.name, protocol = EXCLUDED.protocol, "
            "config = EXCLUDED.config, "
            "updated_at = EXCLUDED.updated_at",
            item_id,
            dumped["name"],
            dumped["protocol"],
            dumped["config"],
            record.created_at,
            record.updated_at,
        )

    async def read_all(self) -> list[TransportClient]:
        rows = await self._pool.fetch(
            "SELECT id, name, protocol, config, created_at, updated_at "
            "FROM dm_transports ORDER BY id",
        )
        return [self._row_to_client(row) for row in rows]

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
