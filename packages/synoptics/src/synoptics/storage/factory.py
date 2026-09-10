"""Builds the plate store named by a connection URL."""

from models.errors import StorageConnectionError, UnsupportedStorageError
from synoptics.storage.memory import MemoryStorage
from synoptics.storage.protocol import SynopticsStorage

_POSTGRES_PREFIX = "postgresql"


async def build_storage(url: str | None) -> SynopticsStorage:
    """``url=None`` selects the in-memory backend. A ``postgresql://`` URL
    builds the postgres backend, applying migrations and opening a pool.

    Raises:
        UnsupportedStorageError: the URL scheme is not recognised.
        StorageConnectionError: the postgres backend cannot be reached or
            initialized.
    """
    if url is None:
        return MemoryStorage()

    if url.startswith(_POSTGRES_PREFIX):
        # Lazy import so a memory-only deployment never loads asyncpg / yoyo.
        from synoptics.storage.postgres import build_postgres_storage  # noqa: PLC0415

        try:
            return await build_postgres_storage(url)
        except Exception as exc:
            msg = "Failed to initialize synoptics postgres backend"
            raise StorageConnectionError(msg) from exc

    msg = f"Unsupported synoptics storage URL scheme: {url!r}"
    raise UnsupportedStorageError(msg)
