from collections.abc import Mapping
from types import TracebackType
from typing import Self

import asyncpg


class PostgresConnectionManager:
    _connection_dsn: str | None
    _pool: asyncpg.Pool | None
    _pool_kwargs: Mapping[str, object]
    _owns_pool: bool
    _close_external_pool: bool

    def __init__(
        self,
        connection: str | asyncpg.Pool,
        *,
        close_external_pool: bool = False,
        **pool_kwargs: object,
    ) -> None:
        if isinstance(connection, str):
            self._connection_dsn = connection
            self._pool = None
            self._pool_kwargs = pool_kwargs
            self._owns_pool = True
            self._close_external_pool = False
            return

        if pool_kwargs:
            msg = "Pool kwargs are only supported when a connection string is provided."
            raise ValueError(msg)

        self._connection_dsn = None
        self._pool = connection
        self._pool_kwargs = {}
        self._owns_pool = False
        self._close_external_pool = close_external_pool

    async def get_pool(self) -> asyncpg.Pool:
        if self._pool is None:
            if self._connection_dsn is None:
                msg = "No connection string available to create a pool."
                raise RuntimeError(msg)
            self._pool = await asyncpg.create_pool(
                dsn=self._connection_dsn,
                **self._pool_kwargs,
            )
        return self._pool

    async def close(self) -> None:
        if self._pool is None:
            return

        if self._owns_pool or self._close_external_pool:
            await self._pool.close()
            self._pool = None

    async def __aenter__(self) -> Self:
        await self.get_pool()
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        del exc_type, exc, traceback
        await self.close()
