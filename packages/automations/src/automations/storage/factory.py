from __future__ import annotations

from typing import TYPE_CHECKING

from models.errors import InvalidError

if TYPE_CHECKING:
    from automations.storage.backend import AutomationsStorageBackend


async def build_storage(url: str) -> AutomationsStorageBackend:
    if url.startswith("postgresql"):
        import asyncpg  # noqa: PLC0415

        from automations.storage.postgres import PostgresStorage  # noqa: PLC0415

        pool = await asyncpg.create_pool(url, min_size=1, max_size=3)
        return PostgresStorage(pool, dsn=url)

    msg = f"Unsupported storage URL scheme: {url}"
    raise InvalidError(msg)
