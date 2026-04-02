from __future__ import annotations

from typing import TYPE_CHECKING

from models.errors import InvalidError
from timeseries.storage.memory import MemoryStorage

if TYPE_CHECKING:
    from timeseries.storage.protocol import TimeSeriesStorage


async def build_storage(url: str | None = None) -> TimeSeriesStorage:
    if url is None:
        return MemoryStorage()

    if url.startswith("postgresql"):
        import asyncpg  # noqa: PLC0415

        from timeseries.storage.postgres import (  # noqa: PLC0415
            PostgresStorage,
            run_migrations,
        )

        run_migrations(url)
        pool = await asyncpg.create_pool(url, min_size=1, max_size=3)
        storage = PostgresStorage(pool)
        await storage.try_enable_hypertable()
        return storage

    msg = f"Unsupported storage URL scheme: {url}"
    raise InvalidError(msg)
