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
        # Lazy: defer the postgres module (and its asyncpg / yoyo imports)
        # until the caller actually selects postgres. Keeps the memory-only
        # path free of heavy dependencies.
        from commands.storage.postgres import build_postgres_storage  # noqa: PLC0415

        return await build_postgres_storage(url)

    msg = f"Unsupported storage URL scheme: {url}"
    raise InvalidError(msg)
