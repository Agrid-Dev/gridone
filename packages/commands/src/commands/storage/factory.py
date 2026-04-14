from __future__ import annotations

from typing import TYPE_CHECKING

from commands.storage.memory import MemoryStorage
from models.errors import InvalidError

if TYPE_CHECKING:
    from commands.storage.protocol import CommandsStorage


async def build_storage(url: str | None = None) -> CommandsStorage:
    if url is None:
        return MemoryStorage()

    if url.startswith("postgresql"):
        import asyncpg  # noqa: PLC0415

        from commands.storage.postgres import (  # noqa: PLC0415
            PostgresCommandsStorage,
            run_migrations,
        )

        run_migrations(url)
        pool = await asyncpg.create_pool(url, min_size=1, max_size=3)
        return PostgresCommandsStorage(pool)

    msg = f"Unsupported storage URL scheme: {url}"
    raise InvalidError(msg)
