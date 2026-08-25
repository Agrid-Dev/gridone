from __future__ import annotations

from typing import TYPE_CHECKING

from devices_manager.storage.driver_record import (
    DriverRecord,
    from_record,
    to_record,
)

if TYPE_CHECKING:
    from datetime import datetime

    import asyncpg

    from devices_manager.core.driver import Driver

# Fields that stay in the JSONB data column
_JSONB_FIELDS = {
    "version",
    "image_src",
    "env",
    "update_strategy",
    "device_config",
    "attributes",
    "discovery",
}


class PostgresDriverStorage:
    """``DriverStorage`` port over the dm_drivers table."""

    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    @staticmethod
    def _row_to_driver(row: asyncpg.Record) -> Driver:
        return from_record(
            DriverRecord.model_validate(
                {
                    "id": row["id"],
                    "vendor": row["vendor"],
                    "model": row["model"],
                    "type": row["type"],
                    "transport": row["transport"],
                    "created_at": row["created_at"],
                    "updated_at": row["updated_at"],
                    **row["data"],
                }
            )
        )

    @staticmethod
    def _record_to_columns(
        item_id: str,
        record: DriverRecord,
    ) -> tuple[str, str | None, str | None, str | None, str, datetime, datetime, dict]:
        dumped = record.model_dump(mode="json")
        jsonb_data = {k: dumped[k] for k in _JSONB_FIELDS if k in dumped}
        return (
            item_id,
            dumped.get("vendor"),
            dumped.get("model"),
            dumped.get("type"),
            dumped["transport"],
            record.created_at,
            record.updated_at,
            jsonb_data,
        )

    async def read(self, item_id: str) -> Driver:
        row = await self._pool.fetchrow(
            "SELECT id, vendor, model, type, transport, created_at, updated_at, data "
            "FROM dm_drivers WHERE id = $1",
            item_id,
        )
        if row is None:
            msg = f"dm_drivers entry '{item_id}' not found"
            raise FileNotFoundError(msg)
        return self._row_to_driver(row)

    async def write(self, item_id: str, driver: Driver) -> None:
        params = self._record_to_columns(item_id, to_record(driver))
        await self._pool.execute(
            "INSERT INTO dm_drivers"
            " (id, vendor, model, type, transport, created_at, updated_at, data)"
            " VALUES ($1, $2, $3, $4, $5, $6, $7, $8)"
            " ON CONFLICT (id) DO UPDATE SET"
            " vendor = EXCLUDED.vendor, model = EXCLUDED.model,"
            " type = EXCLUDED.type, transport = EXCLUDED.transport,"
            " updated_at = EXCLUDED.updated_at,"
            " data = EXCLUDED.data",
            *params,
        )

    async def read_all(self) -> list[Driver]:
        rows = await self._pool.fetch(
            "SELECT id, vendor, model, type, transport, created_at, updated_at, data "
            "FROM dm_drivers ORDER BY id",
        )
        return [self._row_to_driver(row) for row in rows]

    async def list_all(self) -> list[str]:
        rows = await self._pool.fetch("SELECT id FROM dm_drivers ORDER BY id")
        return [row["id"] for row in rows]

    async def delete(self, item_id: str) -> None:
        result = await self._pool.execute(
            "DELETE FROM dm_drivers WHERE id = $1", item_id
        )
        if result == "DELETE 0":
            msg = f"dm_drivers entry '{item_id}' not found"
            raise FileNotFoundError(msg)
