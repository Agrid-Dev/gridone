from __future__ import annotations

from typing import TYPE_CHECKING

from models.errors import InvalidError

if TYPE_CHECKING:
    from automations.storage.backend import AutomationsStorageBackend


async def build_storage(url: str) -> AutomationsStorageBackend:
    if url.startswith("postgresql"):
        from automations.storage.postgres import PostgresStorage  # noqa: PLC0415

        return await PostgresStorage.from_url(url)

    msg = f"Unsupported storage URL scheme: {url}"
    raise InvalidError(msg)
