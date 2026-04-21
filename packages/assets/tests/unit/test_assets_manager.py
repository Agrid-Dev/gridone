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


class TestGetDescendants:
    async def test_returns_descendants(
        self, manager: AssetsManager, storage: AsyncMock
    ) -> None:
        child = AssetInDB(
            id="child-1", parent_id="asset-1", type=AssetType.FLOOR, name="Floor 1"
        )
        storage.get_by_id.return_value = _ASSET
        storage.get_descendants.return_value = [child]

        result = await manager.get_descendants("asset-1")

        assert len(result) == 1
        assert result[0].id == "child-1"
        storage.get_descendants.assert_awaited_once_with("asset-1")

    async def test_not_found(self, manager: AssetsManager, storage: AsyncMock) -> None:
        storage.get_by_id.return_value = None

        with pytest.raises(NotFoundError):
            await manager.get_descendants("missing")
