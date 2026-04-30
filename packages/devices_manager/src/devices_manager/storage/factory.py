from __future__ import annotations

from typing import TYPE_CHECKING

from models.errors import StorageConnectionError, UnsupportedStorageError

from .memory import MemoryDevicesStorage

if TYPE_CHECKING:
    from .storage_backend import DevicesManagerStorage

_POSTGRES_PREFIX = "postgresql"


async def build_storage(url: str | None = None) -> DevicesManagerStorage:
    """Build a devices_manager storage backend from a connection URL.

    ``url=None`` selects the in-memory backend. A ``postgresql://`` URL
    builds the postgres backend, applying yoyo migrations and opening an
    asyncpg pool.

    Raises:
        UnsupportedStorageError: the URL scheme is not recognised.
        StorageConnectionError: the postgres backend cannot be reached or
            initialized (migration failure, connection refused, ...).
    """
    if url is None:
        return MemoryDevicesStorage()

    if url.startswith(_POSTGRES_PREFIX):
        import json  # noqa: PLC0415

        import asyncpg  # noqa: PLC0415

        from .postgres import (  # noqa: PLC0415
            PostgresDevicesManagerStorage,
            run_migrations,
        )

        async def _init_connection(conn: asyncpg.Connection) -> None:
            await conn.set_type_codec(
                "jsonb",
                encoder=json.dumps,
                decoder=json.loads,
                schema="pg_catalog",
            )

        try:
            run_migrations(url)
            pool = await asyncpg.create_pool(
                dsn=url, min_size=1, max_size=3, init=_init_connection
            )
        except Exception as exc:
            msg = "Failed to initialize devices_manager postgres backend"
            raise StorageConnectionError(msg) from exc
        return PostgresDevicesManagerStorage(pool)

    msg = f"Unsupported devices_manager storage URL scheme: {url!r}"
    raise UnsupportedStorageError(msg)


__all__ = ["build_storage"]
