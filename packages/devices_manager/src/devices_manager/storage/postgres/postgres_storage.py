import json
import re
from collections.abc import Callable
from typing import Any

import asyncpg
from pydantic import BaseModel

from ..storage_backend import StorageBackend

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
    def _decode_json_value(value: Any) -> dict:
        if isinstance(value, str):
            decoded = json.loads(value)
        else:
            decoded = value
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

    async def read(self, id: str) -> M:
        query = f"SELECT data FROM {self._table_name} WHERE id = $1"
        row = await self._pool.fetchrow(query, id)
        if row is None:
            msg = f"{self._table_name} entry '{id}' not found"
            raise FileNotFoundError(msg)
        data = self._decode_json_value(row["data"])
        return self._deserializer(data)

    async def write(self, id: str, data: M) -> None:
        payload = json.dumps(
            data.model_dump(mode="json")  # ty:ignore[unresolved-attribute]
        )
        query = (
            f"INSERT INTO {self._table_name} (id, data) VALUES ($1, $2::jsonb) "
            "ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data"
        )
        await self._pool.execute(query, id, payload)

    async def read_all(self) -> list[M]:
        query = f"SELECT data FROM {self._table_name} ORDER BY id"
        rows = await self._pool.fetch(query)
        return [
            self._deserializer(self._decode_json_value(row["data"])) for row in rows
        ]

    async def list_all(self) -> list[str]:
        query = f"SELECT id FROM {self._table_name} ORDER BY id"
        rows = await self._pool.fetch(query)
        return [row["id"] for row in rows]

    async def delete(self, id: str) -> None:
        query = f"DELETE FROM {self._table_name} WHERE id = $1"
        command_tag = await self._pool.execute(query, id)
        if self._affected_rows(command_tag) == 0:
            msg = f"{self._table_name} entry '{id}' not found"
            raise FileNotFoundError(msg)
