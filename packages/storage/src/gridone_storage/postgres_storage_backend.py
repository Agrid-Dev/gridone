import json
import re
from abc import ABC, abstractmethod

from .errors import NotFoundError
from .postgres_connection_manager import PostgresConnectionManager
from .storage_backend import StorageBackend

_IDENTIFIER_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def _quote_identifier(identifier: str) -> str:
    if not _IDENTIFIER_RE.fullmatch(identifier):
        msg = f"Invalid SQL identifier: {identifier!r}"
        raise ValueError(msg)
    return f'"{identifier}"'


class PostgresStorageBackend[M](ABC, StorageBackend[M]):
    _connection_manager: PostgresConnectionManager
    _table_sql: str
    _id_column_sql: str
    _data_column_sql: str
    _read_query: str
    _write_query: str
    _read_all_query: str
    _list_all_query: str
    _delete_query: str

    def __init__(
        self,
        connection_manager: PostgresConnectionManager,
        table_name: str,
        *,
        schema_name: str | None = None,
        id_column: str = "id",
        data_column: str = "data",
    ) -> None:
        self._connection_manager = connection_manager
        self._table_sql = self._build_table_ref(
            table_name=table_name,
            schema_name=schema_name,
        )
        self._id_column_sql = _quote_identifier(id_column)
        self._data_column_sql = _quote_identifier(data_column)

        # Identifiers are validated and quoted before query construction.
        self._read_query = (
            f"SELECT {self._data_column_sql} "  # noqa: S608
            f"FROM {self._table_sql} "
            f"WHERE {self._id_column_sql} = $1"
        )
        self._write_query = (
            f"INSERT INTO {self._table_sql} "  # noqa: S608
            f"({self._id_column_sql}, {self._data_column_sql}) "
            "VALUES ($1, $2::jsonb) "
            f"ON CONFLICT ({self._id_column_sql}) "
            f"DO UPDATE SET {self._data_column_sql} = EXCLUDED.{self._data_column_sql}"
        )
        self._read_all_query = (
            f"SELECT {self._id_column_sql}, {self._data_column_sql} "  # noqa: S608
            f"FROM {self._table_sql} "
            f"ORDER BY {self._id_column_sql}"
        )
        self._list_all_query = (
            f"SELECT {self._id_column_sql} "  # noqa: S608
            f"FROM {self._table_sql} "
            f"ORDER BY {self._id_column_sql}"
        )
        self._delete_query = (
            f"DELETE FROM {self._table_sql} "  # noqa: S608
            f"WHERE {self._id_column_sql} = $1"
        )

    @staticmethod
    def _build_table_ref(table_name: str, schema_name: str | None) -> str:
        table_sql = _quote_identifier(table_name)
        if schema_name is None:
            return table_sql
        return f"{_quote_identifier(schema_name)}.{table_sql}"

    @abstractmethod
    def serialize(self, data: M) -> object:
        """Convert a model instance into JSON-serializable data."""

    @abstractmethod
    def deserialize(self, data: object, *, item_id: str) -> M:
        """Build a model instance from JSON data and its identifier."""

    @staticmethod
    def _decode_jsonb(raw_data: object) -> object:
        if isinstance(raw_data, str):
            return json.loads(raw_data)
        return raw_data

    async def read(self, item_id: str) -> M:
        pool = await self._connection_manager.get_pool()
        row = await pool.fetchrow(self._read_query, item_id)
        if row is None:
            raise NotFoundError(item_id)
        return self.deserialize(self._decode_jsonb(row[0]), item_id=item_id)

    async def write(self, item_id: str, data: M) -> None:
        pool = await self._connection_manager.get_pool()
        payload = json.dumps(self.serialize(data))
        await pool.execute(self._write_query, item_id, payload)

    async def read_all(self) -> list[M]:
        pool = await self._connection_manager.get_pool()
        rows = await pool.fetch(self._read_all_query)
        entities: list[M] = []
        for row in rows:
            db_id = str(row[0])
            entities.append(
                self.deserialize(self._decode_jsonb(row[1]), item_id=db_id),
            )
        return entities

    async def list_all(self) -> list[str]:
        pool = await self._connection_manager.get_pool()
        rows = await pool.fetch(self._list_all_query)
        return [str(row[0]) for row in rows]

    async def delete(self, item_id: str) -> None:
        pool = await self._connection_manager.get_pool()
        await pool.execute(self._delete_query, item_id)
