from __future__ import annotations

from typing import TYPE_CHECKING

from dashboards.storage.memory import MemoryStorage
from models.errors import StorageConnectionError, UnsupportedStorageError

if TYPE_CHECKING:
    from dashboards.storage.protocol import DashboardsStorage
    from dashboards.widgets.registry import WidgetRegistry

_POSTGRES_PREFIX = "postgresql"


async def build_storage(
    url: str | None,
    registry: WidgetRegistry,
) -> DashboardsStorage:
    """Build a dashboards storage backend from a connection URL.

    ``url=None`` selects the in-memory backend. A ``postgresql://`` URL builds
    the postgres backend, applying yoyo migrations and opening an asyncpg pool.
    The ``registry`` lets the postgres backend reconstruct each widget's
    concrete config model when reading rows back; the memory backend keeps live
    objects and ignores it.

    Raises:
        UnsupportedStorageError: the URL scheme is not recognised.
        StorageConnectionError: the postgres backend cannot be reached or
            initialized (migration failure, connection refused, ...).
    """
    if url is None:
        return MemoryStorage()

    if url.startswith(_POSTGRES_PREFIX):
        # Lazy import so a memory-only deployment never loads asyncpg / yoyo.
        from dashboards.storage.postgres import build_postgres_storage  # noqa: PLC0415

        try:
            return await build_postgres_storage(url, registry)
        except Exception as exc:
            msg = "Failed to initialize dashboards postgres backend"
            raise StorageConnectionError(msg) from exc

    msg = f"Unsupported dashboards storage URL scheme: {url!r}"
    raise UnsupportedStorageError(msg)
