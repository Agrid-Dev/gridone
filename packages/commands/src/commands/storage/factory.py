from __future__ import annotations

from typing import TYPE_CHECKING

from commands.storage.memory import MemoryStorage
from models.errors import StorageConnectionError, UnsupportedStorageError

if TYPE_CHECKING:
    from commands.storage.protocol import CommandsStorage

_POSTGRES_PREFIX = "postgresql"


async def build_storage(url: str | None = None) -> CommandsStorage:
    """Build a commands storage backend from a connection URL.

    ``url=None`` selects the in-memory backend. A ``postgresql://`` URL
    builds the postgres backend, applying yoyo migrations and opening an
    asyncpg pool.

    Raises:
        UnsupportedStorageError: the URL scheme is not recognised.
        StorageConnectionError: the postgres backend cannot be reached or
            initialized (migration failure, connection refused, ...).
    """
    if url is None:
        return MemoryStorage()

    if url.startswith(_POSTGRES_PREFIX):
        # Lazy: defer the postgres module (and its asyncpg / yoyo imports)
        # until the caller actually selects postgres. Keeps the memory-only
        # path free of heavy dependencies.
        from commands.storage.postgres import build_postgres_storage  # noqa: PLC0415

        try:
            return await build_postgres_storage(url)
        except Exception as e:
            msg = "Failed to initialize commands postgres backend"
            raise StorageConnectionError(msg) from e

    msg = f"Unsupported commands storage URL scheme: {url!r}"
    raise UnsupportedStorageError(msg)
