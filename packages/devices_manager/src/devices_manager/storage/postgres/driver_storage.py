from __future__ import annotations

from copy import deepcopy
from typing import TYPE_CHECKING

from devices_manager.storage.driver_record import (
    DriverRecord,
    from_record,
    to_record,
)
from models.errors import ConflictError

if TYPE_CHECKING:
    from datetime import datetime

    import asyncpg

    from devices_manager.core.driver import Driver

    from .session import PostgresSession

# Fields that stay in the JSONB data column
_JSONB_FIELDS = {
    "version",
    "image_src",
    "env",
    "update_strategy",
    "healthcheck",
    "device_config",
    "attributes",
    "discovery",
    "presentation",
    "presentation_revision",
}


class PostgresDriverStorage:
    """``DriverStorage`` port over the dm_drivers table."""

    def __init__(self, pool: asyncpg.Pool | PostgresSession) -> None:
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
                    # Validators may normalize nested dictionaries in place;
                    # preserve the raw row for compare-and-swap predicates.
                    **deepcopy(row["data"]),
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
        row = await self._read_row(item_id)
        if row is None:
            msg = f"dm_drivers entry '{item_id}' not found"
            raise FileNotFoundError(msg)
        return self._row_to_driver(row)

    async def _read_row(self, item_id: str) -> asyncpg.Record | None:
        return await self._pool.fetchrow(
            "SELECT id, vendor, model, type, transport, created_at, updated_at, data "
            "FROM dm_drivers WHERE id = $1",
            item_id,
        )

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

    async def compare_and_swap(self, driver: Driver, expected: Driver | None) -> None:
        """Compare hydrated records, then atomically replace the raw snapshot.

        Legacy JSON can omit defaults supplied during hydration. Compare domain
        records first, then use the exact stored columns in the SQL predicate so
        a concurrent change between the read and update still rejects the write.
        """
        params = self._record_to_columns(driver.id, to_record(driver))
        if expected is None:
            result = await self._pool.execute(
                "INSERT INTO dm_drivers "
                "(id,vendor,model,type,transport,created_at,updated_at,data) "
                "VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING",
                *params,
            )
            success = result == "INSERT 0 1"
        else:
            row = await self._read_row(driver.id)
            if row is None or to_record(self._row_to_driver(row)) != to_record(
                expected
            ):
                msg = "Driver changed during package installation"
                raise ConflictError(msg)
            result = await self._pool.execute(
                "UPDATE dm_drivers SET "
                "vendor=$2,model=$3,type=$4,transport=$5,"
                "created_at=$6,updated_at=$7,data=$8 "
                "WHERE id=$1 AND vendor IS NOT DISTINCT FROM $9 AND model IS NOT "
                "DISTINCT FROM $10 AND type IS NOT DISTINCT FROM $11 AND "
                "transport=$12 AND created_at=$13 AND updated_at=$14 AND "
                "data=$15",
                *params,
                row["vendor"],
                row["model"],
                row["type"],
                row["transport"],
                row["created_at"],
                row["updated_at"],
                row["data"],
            )
            success = result == "UPDATE 1"
        if not success:
            msg = "Driver changed during package installation"
            raise ConflictError(msg)

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
