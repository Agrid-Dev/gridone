import json
import re
from collections.abc import Callable

import asyncpg
from pydantic import BaseModel

from devices_manager.storage.storage_backend import StorageBackend

TABLE_NAME_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


class PostgresStorageBackend[M: BaseModel](StorageBackend[M]):
    _table_name: str
    _pool: asyncpg.Pool
    _deserializer: Callable[[dict], M]

    def __init__(
        self,
        table_name: str,
        pool: asyncpg.Pool,
        deserializer: Callable[[dict], M],
    ) -> None:
        if not TABLE_NAME_PATTERN.fullmatch(table_name):
            msg = f"Invalid table name '{table_name}'"
            raise ValueError(msg)
        self._table_name = table_name
        self._pool = pool
        self._deserializer = deserializer

    @staticmethod
    def _decode_json_value(value: object) -> dict:
        decoded = json.loads(value) if isinstance(value, str) else value
        if not isinstance(decoded, dict):
            msg = f"Expected JSON object payload, got {type(decoded).__name__}"
            raise TypeError(msg)
        return decoded

    @staticmethod
    def _affected_rows(command_tag: str) -> int:
        try:
            return int(command_tag.rsplit(" ", maxsplit=1)[-1])
        except (TypeError, ValueError) as e:
            msg = f"Unexpected postgres command tag '{command_tag}'"
            raise ValueError(msg) from e

    async def read(self, item_id: str) -> M:
        query = f"SELECT data FROM {self._table_name} WHERE id = $1"  # noqa: S608
        row = await self._pool.fetchrow(query, item_id)
        if row is None:
            msg = f"{self._table_name} entry '{item_id}' not found"
            raise FileNotFoundError(msg)
        data = self._decode_json_value(row["data"])
        return self._deserializer(data)

    async def write(self, item_id: str, data: M) -> None:
        payload = json.dumps(
            data.model_dump(mode="json")  # ty:ignore[unresolved-attribute]
        )
        query = (
            f"INSERT INTO {self._table_name} (id, data) VALUES ($1, $2::jsonb) "  # noqa: S608
            "ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data"
        )
        await self._pool.execute(query, item_id, payload)

    async def read_all(self) -> list[M]:
        query = f"SELECT data FROM {self._table_name} ORDER BY id"  # noqa: S608
        rows = await self._pool.fetch(query)
        return [
            self._deserializer(self._decode_json_value(row["data"])) for row in rows
        ]

    async def list_all(self) -> list[str]:
        query = f"SELECT id FROM {self._table_name} ORDER BY id"  # noqa: S608
        rows = await self._pool.fetch(query)
        return [row["id"] for row in rows]

    async def delete(self, item_id: str) -> None:
        query = f"DELETE FROM {self._table_name} WHERE id = $1"  # noqa: S608
        command_tag = await self._pool.execute(query, item_id)
        if self._affected_rows(command_tag) == 0:
            msg = f"{self._table_name} entry '{item_id}' not found"
            raise FileNotFoundError(msg)
