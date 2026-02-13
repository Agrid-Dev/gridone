from abc import ABC, abstractmethod
from collections.abc import Sequence
from typing import Protocol

from .postgres_connection_manager import PostgresConnectionManager


class SchemaManager(Protocol):
    async def ensure_schema(self) -> None:
        """Ensure the storage schema exists and is up-to-date."""


class BaseSchemaManager(ABC, SchemaManager):
    _connection_manager: PostgresConnectionManager

    def __init__(self, connection_manager: PostgresConnectionManager) -> None:
        self._connection_manager = connection_manager

    @property
    @abstractmethod
    def schema_statements(self) -> Sequence[str]:
        """DDL statements that define the service schema."""

    async def ensure_schema(self) -> None:
        pool = await self._connection_manager.get_pool()
        async with pool.acquire() as connection, connection.transaction():
            for statement in self.schema_statements:
                await connection.execute(statement)
