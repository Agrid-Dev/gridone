from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from assets.manager import AssetsManager
from assets.models import AssetType
from assets.storage.models import AssetInDB
from assets.storage.storage_backend import AssetsStorageBackend
from models.errors import NotFoundError

pytestmark = pytest.mark.asyncio


@pytest.fixture
def storage() -> AsyncMock:
    return AsyncMock(spec=AssetsStorageBackend)


@pytest.fixture
def manager(storage: AsyncMock) -> AssetsManager:
    return AssetsManager(storage)


_ASSET = AssetInDB(
    id="asset-1",
    parent_id="root",
    type=AssetType.BUILDING,
    name="Building 1",
)


class TestResolveDeviceIds:
    async def test_non_recursive(
        self, manager: AssetsManager, storage: AsyncMock
    ) -> None:
        storage.get_by_id.return_value = _ASSET
        storage.get_device_ids_for_asset.return_value = ["dev-1", "dev-2"]

        result = await manager.resolve_device_ids("asset-1")

        assert result == ["dev-1", "dev-2"]
        storage.get_device_ids_for_asset.assert_awaited_once_with("asset-1")
        storage.get_device_ids_for_subtree.assert_not_awaited()

    async def test_recursive(self, manager: AssetsManager, storage: AsyncMock) -> None:
        storage.get_by_id.return_value = _ASSET
        storage.get_device_ids_for_subtree.return_value = ["dev-1", "dev-2", "dev-3"]

        result = await manager.resolve_device_ids("asset-1", recursive=True)

        assert result == ["dev-1", "dev-2", "dev-3"]
        storage.get_device_ids_for_subtree.assert_awaited_once_with("asset-1")
        storage.get_device_ids_for_asset.assert_not_awaited()

    async def test_allowed_device_ids_filter(
        self, manager: AssetsManager, storage: AsyncMock
    ) -> None:
        storage.get_by_id.return_value = _ASSET
        storage.get_device_ids_for_subtree.return_value = ["dev-1", "dev-2", "dev-3"]

        result = await manager.resolve_device_ids(
            "asset-1", recursive=True, allowed_device_ids={"dev-1", "dev-3"}
        )

        assert result == ["dev-1", "dev-3"]

    async def test_allowed_device_ids_empty_intersection(
        self, manager: AssetsManager, storage: AsyncMock
    ) -> None:
        storage.get_by_id.return_value = _ASSET
        storage.get_device_ids_for_asset.return_value = ["dev-1", "dev-2"]

        result = await manager.resolve_device_ids(
            "asset-1", allowed_device_ids={"dev-99"}
        )

        assert result == []

    async def test_not_found(self, manager: AssetsManager, storage: AsyncMock) -> None:
        storage.get_by_id.return_value = None

        with pytest.raises(NotFoundError):
            await manager.resolve_device_ids("missing")
