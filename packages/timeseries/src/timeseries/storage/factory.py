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

        from timeseries.storage.postgres import PostgresStorage  # noqa: PLC0415

        pool = await asyncpg.create_pool(url)
        storage = PostgresStorage(pool)
        await storage.ensure_schema()
        return storage

    msg = f"Unsupported storage URL scheme: {url}"
    raise InvalidError(msg)
