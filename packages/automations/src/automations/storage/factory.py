from __future__ import annotations

from typing import TYPE_CHECKING

from automations.storage.memory import MemoryAutomationsStorage
from models.errors import StorageConnectionError, UnsupportedStorageError

if TYPE_CHECKING:
    from automations.storage.backend import AutomationsStorageBackend

_POSTGRES_PREFIX = "postgresql"


async def build_storage(url: str | None = None) -> AutomationsStorageBackend:
    """Build an automations storage backend from a connection URL.

    ``url=None`` selects the in-memory backend. A ``postgresql://`` URL
    builds the postgres backend, which applies yoyo migrations and opens an
    asyncpg pool inside :meth:`PostgresStorage.start`.

    Raises:
        UnsupportedStorageError: the URL scheme is not recognised.
        StorageConnectionError: the postgres backend cannot be reached or
            initialized (migration failure, connection refused, ...).
    """
    if url is None:
        return MemoryAutomationsStorage()

    if url.startswith(_POSTGRES_PREFIX):
        from automations.storage.postgres import PostgresStorage  # noqa: PLC0415

        try:
            return await PostgresStorage.from_url(url)
        except Exception as e:
            msg = "Failed to initialize automations postgres backend"
            raise StorageConnectionError(msg) from e

    msg = f"Unsupported automations storage URL scheme: {url!r}"
    raise UnsupportedStorageError(msg)
