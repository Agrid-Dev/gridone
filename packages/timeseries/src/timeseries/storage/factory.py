from __future__ import annotations

from typing import TYPE_CHECKING

from models.errors import StorageConnectionError, UnsupportedStorageError

if TYPE_CHECKING:
    from timeseries.storage.protocol import TimeSeriesStorage

_POSTGRES_PREFIX = "postgresql"


async def build_storage(url: str | None = None) -> TimeSeriesStorage:
    if url is None:
        from timeseries.storage.memory import MemoryStorage  # noqa: PLC0415

        return MemoryStorage()

    if url.startswith(_POSTGRES_PREFIX):
        import asyncpg  # noqa: PLC0415

        from timeseries.storage.postgres import PostgresStorage  # noqa: PLC0415

        try:
            pool = await asyncpg.create_pool(url, min_size=1, max_size=3)
        except Exception as e:
            msg = f"Failed to initialize timeseries postgres backend at {url!r}"
            raise StorageConnectionError(msg) from e
        return PostgresStorage(pool)

    msg = f"Unsupported timeseries storage URL scheme: {url!r}"
    raise UnsupportedStorageError(msg)
