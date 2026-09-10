"""Reuse an installation's locked connection instead of exhausting the pool."""

from __future__ import annotations

from contextlib import asynccontextmanager
from contextvars import ContextVar
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

    import asyncpg


class PostgresSession:
    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool
        self._connection: ContextVar[asyncpg.Connection | None] = ContextVar(
            "presentation_connection", default=None
        )

    @asynccontextmanager
    async def acquire(self) -> AsyncIterator[asyncpg.Connection]:
        connection = self._connection.get()
        if connection is not None:
            yield connection
        else:
            async with self._pool.acquire() as acquired:
                yield acquired

    @asynccontextmanager
    async def installation(self, driver_id: str) -> AsyncIterator[None]:
        """Bind all publication/CAS/prune queries to one advisory-locked session.

        Resource publication and driver CAS still commit before returning: the
        lock serializes garbage collection without postponing durability until
        after the registry has published its in-memory driver.
        """
        async with self._pool.acquire() as connection:
            await connection.execute(
                "SELECT pg_advisory_lock(hashtextextended($1, 1))", driver_id
            )
            token = self._connection.set(connection)
            try:
                yield
            finally:
                self._connection.reset(token)
                await connection.execute(
                    "SELECT pg_advisory_unlock(hashtextextended($1, 1))", driver_id
                )

    async def execute(self, query: str, *args: object) -> str:
        async with self.acquire() as connection:
            return await connection.execute(query, *args)

    async def fetch(self, query: str, *args: object) -> list[asyncpg.Record]:
        async with self.acquire() as connection:
            return await connection.fetch(query, *args)

    async def fetchrow(self, query: str, *args: object) -> asyncpg.Record | None:
        async with self.acquire() as connection:
            return await connection.fetchrow(query, *args)
