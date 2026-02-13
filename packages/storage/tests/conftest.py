import os
from collections.abc import AsyncIterator

import asyncpg
import pytest
import pytest_asyncio

TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL")
REQUIRES_DATABASE = pytest.mark.skipif(
    TEST_DATABASE_URL is None,
    reason="TEST_DATABASE_URL is not set.",
)


@pytest_asyncio.fixture(scope="session")
async def database_url() -> str:
    database_url = TEST_DATABASE_URL
    if database_url is None:
        pytest.skip("TEST_DATABASE_URL is not set.")
        msg = "TEST_DATABASE_URL is not set."
        raise RuntimeError(msg)

    connection: asyncpg.Connection | None = None
    try:
        connection = await asyncpg.connect(database_url)
    except Exception as exc:  # noqa: BLE001
        pytest.skip(f"Postgres is not available: {exc}")
    finally:
        if connection is not None:
            await connection.close()

    return database_url


@pytest_asyncio.fixture
async def db_connection(database_url: str) -> AsyncIterator[asyncpg.Connection]:
    connection = await asyncpg.connect(database_url)
    transaction = connection.transaction()
    await transaction.start()

    try:
        yield connection
    finally:
        await transaction.rollback()
        await connection.close()
