"""Immutable resource directories; only complete revisions become visible."""

from __future__ import annotations

import asyncio
import fcntl
import hashlib
import json
import shutil
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path
from typing import TYPE_CHECKING

from pydantic import BaseModel

from devices_manager.core.presentation.resources import StoredResource
from devices_manager.storage.presentation_resources import stored, verify
from models.errors import ConflictError, NotFoundError

from .atomic import atomic_write, file_lock, sync_directory

if TYPE_CHECKING:
    from collections.abc import AsyncIterator, Mapping
    from collections.abc import Set as AbstractSet

    from devices_manager.core.presentation.resource import NormalizedImage


class ResourceManifest(BaseModel):
    file: str
    media_type: str
    sha256: str
    width: int
    height: int


def storage_key(value: str) -> str:
    """Opaque filesystem key: author-controlled identifiers never become paths."""
    return hashlib.sha256(value.encode()).hexdigest()


class FilePresentationResources:
    def __init__(self, root: Path) -> None:
        self._root = root
        root.mkdir(parents=True, exist_ok=True)
        sync_directory(root.parent)

    @asynccontextmanager
    async def installation(self, driver_id: str) -> AsyncIterator[None]:
        """Serialize publish/activate/prune across processes for the same driver."""
        parent = self._driver(driver_id)
        parent.mkdir(exist_ok=True)
        stream = (parent / ".installation-lock").open("a+b")
        try:
            await asyncio.to_thread(fcntl.flock, stream.fileno(), fcntl.LOCK_EX)
            yield
        finally:
            fcntl.flock(stream.fileno(), fcntl.LOCK_UN)
            stream.close()

    def _driver(self, driver_id: str) -> Path:
        return self._root / storage_key(driver_id)

    def _revision(self, driver_id: str, revision: str) -> Path:
        return self._driver(driver_id) / storage_key(revision)

    def _write(
        self, driver_id: str, revision: str, resources: Mapping[str, NormalizedImage]
    ) -> None:
        """Publish files, manifest and revision directory before any driver pointer."""
        parent = self._driver(driver_id)
        parent.mkdir(exist_ok=True)
        sync_directory(self._root)
        target = self._revision(driver_id, revision)
        with file_lock(parent / ".lock"):
            if target.exists():
                existing = self._manifest(target)
                if set(existing) != set(resources) or any(
                    self._read(driver_id, revision, key) != stored(value)
                    for key, value in resources.items()
                ):
                    msg = "Presentation revision is immutable"
                    raise ConflictError(msg)
                return
            stage = Path(tempfile.mkdtemp(prefix=".tmp-", dir=parent))
            try:
                manifest = {}
                for asset_id, image in resources.items():
                    verify(stored(image))
                    filename = storage_key(asset_id) + ".png"
                    atomic_write(stage / filename, image.data)
                    manifest[asset_id] = ResourceManifest(
                        file=filename,
                        media_type=image.media_type,
                        sha256=image.sha256,
                        width=image.width,
                        height=image.height,
                    ).model_dump()
                atomic_write(
                    stage / "manifest.json",
                    json.dumps({"revision": revision, "assets": manifest}).encode(),
                )
                sync_directory(stage)
                stage.replace(target)
                sync_directory(parent)
            finally:
                if stage.exists():
                    shutil.rmtree(stage)

    async def write_revision(
        self, driver_id: str, revision: str, resources: Mapping[str, NormalizedImage]
    ) -> None:
        await asyncio.to_thread(self._write, driver_id, revision, resources)

    @staticmethod
    def _manifest(path: Path) -> dict[str, ResourceManifest]:
        return {
            key: ResourceManifest.model_validate(value)
            for key, value in json.loads((path / "manifest.json").read_text())[
                "assets"
            ].items()
        }

    def _read(self, driver_id: str, revision: str, asset_id: str) -> StoredResource:
        try:
            path = self._revision(driver_id, revision)
            entry = self._manifest(path)[asset_id]
            # Derive the filename again; never trust a path read from a manifest.
            data = (path / (storage_key(asset_id) + ".png")).read_bytes()
            return verify(
                StoredResource(
                    data, entry.media_type, entry.sha256, entry.width, entry.height
                )
            )
        except (FileNotFoundError, KeyError, ValueError):
            msg = "Presentation resource not found"
            raise NotFoundError(msg) from None

    async def read(
        self, driver_id: str, revision: str, asset_id: str
    ) -> StoredResource:
        return await asyncio.to_thread(self._read, driver_id, revision, asset_id)

    def _list(self, driver_id: str) -> list[str]:
        parent = self._driver(driver_id)
        if not parent.exists():
            return []
        return [
            json.loads(path.read_text())["revision"]
            for path in parent.glob("*/manifest.json")
            if not path.parent.name.startswith(".")
        ]

    async def list_revisions(self, driver_id: str) -> list[str]:
        return await asyncio.to_thread(self._list, driver_id)

    async def delete_revision(self, driver_id: str, revision: str) -> None:
        path = self._revision(driver_id, revision)
        if path.exists():
            await asyncio.to_thread(shutil.rmtree, path)
            await asyncio.to_thread(sync_directory, path.parent)

    async def prune(self, driver_id: str, keep: AbstractSet[str]) -> None:
        for revision in await self.list_revisions(driver_id):
            if revision not in keep:
                await self.delete_revision(driver_id, revision)
