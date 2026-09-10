"""Domain port for immutable, normalized presentation resources."""

from collections.abc import Mapping
from collections.abc import Set as AbstractSet
from contextlib import AbstractAsyncContextManager
from dataclasses import dataclass
from typing import Protocol

from .resource import NormalizedImage


@dataclass(frozen=True)
class StoredResource:
    data: bytes
    media_type: str
    sha256: str
    width: int
    height: int


class PresentationResourceStorage(Protocol):
    def installation(self, driver_id: str) -> AbstractAsyncContextManager[None]: ...
    async def write_revision(
        self, driver_id: str, revision: str, resources: Mapping[str, NormalizedImage]
    ) -> None: ...
    async def read(
        self, driver_id: str, revision: str, asset_id: str
    ) -> StoredResource: ...
    async def list_revisions(self, driver_id: str) -> list[str]: ...
    async def delete_revision(self, driver_id: str, revision: str) -> None: ...
    async def prune(self, driver_id: str, keep: AbstractSet[str]) -> None: ...
