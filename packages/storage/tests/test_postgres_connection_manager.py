import os

import asyncpg
import pytest
from gridone_storage import PostgresConnectionManager

pytestmark = pytest.mark.skipif(
    os.getenv("TEST_DATABASE_URL") is None,
    reason="TEST_DATABASE_URL is not set.",
)


@pytest.mark.asyncio
async def test_creation_from_connection_string(database_url: str) -> None:
    manager = PostgresConnectionManager(database_url)

    pool = await manager.get_pool()
    same_pool = await manager.get_pool()

    assert isinstance(pool, asyncpg.Pool)
    assert pool is same_pool
    assert await pool.fetchval("SELECT 1") == 1

    await manager.close()


@pytest.mark.asyncio
async def test_creation_from_existing_pool(database_url: str) -> None:
    pool = await asyncpg.create_pool(dsn=database_url, min_size=1, max_size=1)
    try:
        manager = PostgresConnectionManager(pool)

        assert await manager.get_pool() is pool

        await manager.close()
        assert await pool.fetchval("SELECT 1") == 1
    finally:
        await pool.close()


@pytest.mark.asyncio
async def test_context_manager_closes_owned_pool(database_url: str) -> None:
    manager = PostgresConnectionManager(database_url)

    async with manager as managed:
        pool_in_context = await managed.get_pool()
        assert await pool_in_context.fetchval("SELECT 1") == 1

    pool_after_context = await manager.get_pool()
    assert pool_after_context is not pool_in_context
    assert await pool_after_context.fetchval("SELECT 1") == 1

    await manager.close()


@pytest.mark.asyncio
async def test_close_is_idempotent(database_url: str) -> None:
    manager = PostgresConnectionManager(database_url)
    await manager.get_pool()

    await manager.close()
    await manager.close()
