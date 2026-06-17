from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from devices_manager.storage.factory import build_storage
from devices_manager.storage.memory import MemoryDevicesStorage
from devices_manager.storage.yaml.core_file_storage import CoreFileStorage
from models.errors import StorageConnectionError, UnsupportedStorageError

if TYPE_CHECKING:
    from pathlib import Path

pytestmark = pytest.mark.asyncio


async def test_build_storage_none_returns_memory():
    storage = await build_storage(None)
    assert isinstance(storage, MemoryDevicesStorage)


async def test_build_storage_yaml_returns_core_file_storage(tmp_path: Path):
    storage = await build_storage(f"yaml:{tmp_path}")
    assert isinstance(storage, CoreFileStorage)


async def test_build_storage_yaml_unwritable_path_raises(tmp_path: Path):
    blocker = tmp_path / "blocker"
    blocker.write_text("not a directory")
    with pytest.raises(StorageConnectionError):
        await build_storage(f"yaml:{blocker}/db")


async def test_build_storage_unsupported_scheme_raises():
    with pytest.raises(UnsupportedStorageError):
        await build_storage("redis://localhost")
