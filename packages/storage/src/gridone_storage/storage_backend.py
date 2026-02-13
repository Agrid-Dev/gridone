from collections.abc import Awaitable
from typing import Protocol

type StorageResult[T] = T | Awaitable[T]


class StorageBackend[M](Protocol):
    def read(self, item_id: str) -> StorageResult[M]:
        """Read a single entity by its identifier."""

    def write(self, item_id: str, data: M) -> StorageResult[None]:
        """Create or update a single entity by its identifier."""

    def read_all(self) -> StorageResult[list[M]]:
        """Read all entities from storage."""

    def list_all(self) -> StorageResult[list[str]]:
        """List all stored entity identifiers."""

    def delete(self, item_id: str) -> StorageResult[None]:
        """Delete an entity by its identifier."""
