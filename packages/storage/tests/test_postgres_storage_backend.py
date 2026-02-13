import os
from collections.abc import AsyncIterator
from typing import cast
from uuid import uuid4

import asyncpg
import pytest
import pytest_asyncio
from gridone_storage import (
    NotFoundError,
    PostgresConnectionManager,
    PostgresStorageBackend,
)
from pydantic import BaseModel

pytestmark = pytest.mark.skipif(
    os.getenv("TEST_DATABASE_URL") is None,
    reason="TEST_DATABASE_URL is not set.",
)


class SampleEntity(BaseModel):
    label: str
    value: int


class SampleBackend(PostgresStorageBackend[SampleEntity]):
    def serialize(self, data: SampleEntity) -> object:
        return data.model_dump(mode="json")

    def deserialize(self, data: object, *, item_id: str) -> SampleEntity:
        del item_id
        if not isinstance(data, dict):
            msg = "Expected JSON object payload."
            raise TypeError(msg)
        return SampleEntity.model_validate(data)


class ConnectionAsPool:
    _connection: asyncpg.Connection

    def __init__(self, connection: asyncpg.Connection) -> None:
        self._connection = connection

    async def fetchrow(self, query: str, *args: object) -> asyncpg.Record | None:
        return await self._connection.fetchrow(query, *args)

    async def fetch(self, query: str, *args: object) -> list[asyncpg.Record]:
        return await self._connection.fetch(query, *args)

    async def execute(self, query: str, *args: object) -> str:
        return await self._connection.execute(query, *args)


class StaticConnectionManager:
    _pool: ConnectionAsPool

    def __init__(self, connection: asyncpg.Connection) -> None:
        self._pool = ConnectionAsPool(connection)

    async def get_pool(self) -> ConnectionAsPool:
        return self._pool


@pytest_asyncio.fixture
async def backend(db_connection: asyncpg.Connection) -> AsyncIterator[SampleBackend]:
    table_name = f"test_backend_{uuid4().hex}"
    await db_connection.execute(
        f"""
        CREATE TABLE {table_name} (
            id TEXT PRIMARY KEY,
            data JSONB NOT NULL
        )
        """,
    )

    manager = cast(
        "PostgresConnectionManager",
        StaticConnectionManager(db_connection),
    )
    yield SampleBackend(connection_manager=manager, table_name=table_name)


@pytest.mark.asyncio
async def test_write_and_read_entity(backend: SampleBackend) -> None:
    entity = SampleEntity(label="first", value=1)

    await backend.write("item-1", entity)
    result = await backend.read("item-1")

    assert result == entity


@pytest.mark.asyncio
async def test_read_non_existent_item_raises_not_found(backend: SampleBackend) -> None:
    with pytest.raises(NotFoundError):
        await backend.read("missing-id")


@pytest.mark.asyncio
async def test_read_all_and_list_all(backend: SampleBackend) -> None:
    await backend.write("item-2", SampleEntity(label="second", value=2))
    await backend.write("item-1", SampleEntity(label="first", value=1))

    identifiers = await backend.list_all()
    entities = await backend.read_all()

    assert identifiers == ["item-1", "item-2"]
    assert entities == [
        SampleEntity(label="first", value=1),
        SampleEntity(label="second", value=2),
    ]


@pytest.mark.asyncio
async def test_write_overwrites_existing_id(backend: SampleBackend) -> None:
    await backend.write("item-1", SampleEntity(label="first", value=1))
    await backend.write("item-1", SampleEntity(label="updated", value=10))

    assert await backend.list_all() == ["item-1"]
    assert await backend.read("item-1") == SampleEntity(label="updated", value=10)


@pytest.mark.asyncio
async def test_delete_existing_item(backend: SampleBackend) -> None:
    await backend.write("item-1", SampleEntity(label="first", value=1))

    await backend.delete("item-1")

    with pytest.raises(NotFoundError):
        await backend.read("item-1")


@pytest.mark.asyncio
async def test_delete_non_existent_item_is_noop(backend: SampleBackend) -> None:
    await backend.delete("missing-id")
    assert await backend.list_all() == []
