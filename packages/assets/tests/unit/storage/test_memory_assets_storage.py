import pytest

from assets.models import AssetType
from assets.storage.memory import MemoryAssetsStorage
from assets.storage.models import AssetInDB

pytestmark = pytest.mark.asyncio


def _asset(asset_id: str, parent_id: str | None = None) -> AssetInDB:
    return AssetInDB(
        id=asset_id, parent_id=parent_id, type=AssetType.ROOM, name=asset_id
    )


class TestDeleteDescendants:
    async def test_removes_the_whole_subtree_and_nothing_else(self):
        storage = MemoryAssetsStorage()
        await storage.save(_asset("root"))
        await storage.save(_asset("b1", parent_id="root"))
        await storage.save(_asset("f1", parent_id="b1"))
        await storage.save(_asset("r1", parent_id="f1"))
        await storage.save(_asset("other", parent_id="root"))

        await storage.delete_descendants("b1")

        assert await storage.get_by_id("b1") is not None
        assert await storage.get_by_id("f1") is None
        assert await storage.get_by_id("r1") is None
        assert await storage.get_by_id("other") is not None
