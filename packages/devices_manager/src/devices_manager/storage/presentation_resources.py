"""Memory resources and shared integrity checks for immutable revisions."""

from __future__ import annotations

import asyncio
import hashlib
from contextlib import asynccontextmanager
from typing import TYPE_CHECKING

from devices_manager.core.presentation.resources import StoredResource
from models.errors import ConflictError, NotFoundError

if TYPE_CHECKING:
    from collections.abc import AsyncIterator, Mapping
    from collections.abc import Set as AbstractSet

    from devices_manager.core.presentation.resource import NormalizedImage


def stored(image: NormalizedImage) -> StoredResource:
    return StoredResource(
        image.data, image.media_type, image.sha256, image.width, image.height
    )


def verify(resource: StoredResource) -> StoredResource:
    if hashlib.sha256(resource.data).hexdigest() != resource.sha256:
        msg = "Presentation resource integrity check failed"
        raise NotFoundError(msg)
    return resource


class MemoryPresentationResources:
    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._revisions: dict[tuple[str, str], dict[str, StoredResource]] = {}

    @asynccontextmanager
    async def installation(self, driver_id: str) -> AsyncIterator[None]:  # noqa: ARG002
        async with self._lock:
            yield

    async def write_revision(
        self, driver_id: str, revision: str, resources: Mapping[str, NormalizedImage]
    ) -> None:
        candidate = {key: verify(stored(image)) for key, image in resources.items()}
        key = (driver_id, revision)
        if key in self._revisions and self._revisions[key] != candidate:
            msg = "Presentation revision is immutable"
            raise ConflictError(msg)
        self._revisions[key] = candidate

    async def read(
        self, driver_id: str, revision: str, asset_id: str
    ) -> StoredResource:
        try:
            return verify(self._revisions[(driver_id, revision)][asset_id])
        except KeyError:
            msg = "Presentation resource not found"
            raise NotFoundError(msg) from None

    async def list_revisions(self, driver_id: str) -> list[str]:
        return [revision for owner, revision in self._revisions if owner == driver_id]

    async def delete_revision(self, driver_id: str, revision: str) -> None:
        self._revisions.pop((driver_id, revision), None)

    async def prune(self, driver_id: str, keep: AbstractSet[str]) -> None:
        for revision in await self.list_revisions(driver_id):
            if revision not in keep:
                await self.delete_revision(driver_id, revision)
