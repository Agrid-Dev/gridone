"""Null-object storage backend that silently discards all writes."""

from __future__ import annotations

from pydantic import BaseModel

from models.errors import NotFoundError


class NullStorageBackend[M: BaseModel]:
    """No-op storage backend for registries that don't need persistence.

    Implements the StorageBackend protocol with no-op writes and empty reads.
    Used as the default when no real storage is injected.
    """

    async def read(self, item_id: str) -> M:
        raise NotFoundError(item_id)

    async def write(self, item_id: str, data: M) -> None:
        pass

    async def read_all(self) -> list[M]:
        return []

    async def list_all(self) -> list[str]:
        return []

    async def delete(self, item_id: str) -> None:
        pass

    async def set_tag(self, device_id: str, key: str, value: str) -> None:
        pass

    async def delete_tag(self, device_id: str, key: str) -> None:
        pass
