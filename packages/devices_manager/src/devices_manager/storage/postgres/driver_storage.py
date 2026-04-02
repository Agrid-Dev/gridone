import json

import asyncpg

from devices_manager.dto import DriverDTO
from devices_manager.storage.storage_backend import StorageBackend

# Fields that stay in the JSONB data column
_JSONB_FIELDS = {
    "version",
    "env",
    "update_strategy",
    "device_config",
    "attributes",
    "discovery",
}


class PostgresDriverStorage(StorageBackend[DriverDTO]):
    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    @staticmethod
    def _row_to_dto(row: asyncpg.Record) -> DriverDTO:
        data = json.loads(row["data"]) if isinstance(row["data"], str) else row["data"]
        return DriverDTO.model_validate(
            {
                "id": row["id"],
                "vendor": row["vendor"],
                "model": row["model"],
                "type": row["type"],
                "transport": row["transport"],
                **data,
            }
        )

    @staticmethod
    def _dto_to_columns(
        item_id: str,
        dto: DriverDTO,
    ) -> tuple[str, str | None, str | None, str | None, str, str]:
        dumped = dto.model_dump(mode="json")
        jsonb_data = {k: dumped[k] for k in _JSONB_FIELDS if k in dumped}
        return (
            item_id,
            dumped.get("vendor"),
            dumped.get("model"),
            dumped.get("type"),
            dumped["transport"],
            json.dumps(jsonb_data),
        )

    async def read(self, item_id: str) -> DriverDTO:
        row = await self._pool.fetchrow(
            "SELECT id, vendor, model, type, transport, data "
            "FROM dm_drivers WHERE id = $1",
            item_id,
        )
        if row is None:
            msg = f"dm_drivers entry '{item_id}' not found"
            raise FileNotFoundError(msg)
        return self._row_to_dto(row)

    async def write(self, item_id: str, data: DriverDTO) -> None:
        params = self._dto_to_columns(item_id, data)
        await self._pool.execute(
            "INSERT INTO dm_drivers"
            " (id, vendor, model, type, transport, data)"
            " VALUES ($1, $2, $3, $4, $5, $6::jsonb)"
            " ON CONFLICT (id) DO UPDATE SET"
            " vendor = EXCLUDED.vendor, model = EXCLUDED.model,"
            " type = EXCLUDED.type, transport = EXCLUDED.transport,"
            " data = EXCLUDED.data",
            *params,
        )

    async def read_all(self) -> list[DriverDTO]:
        rows = await self._pool.fetch(
            "SELECT id, vendor, model, type, transport, data "
            "FROM dm_drivers ORDER BY id",
        )
        return [self._row_to_dto(row) for row in rows]

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
