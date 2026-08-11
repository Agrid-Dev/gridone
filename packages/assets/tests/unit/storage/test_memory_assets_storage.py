from datetime import UTC, datetime

import pytest

from assets.models import AssetType, BuildingModelStatus, ModelSpace, ModelStorey
from assets.storage.memory import MemoryAssetsStorage
from assets.storage.models import AssetInDB, BuildingModelInDB

pytestmark = pytest.mark.asyncio


def _asset(asset_id: str, parent_id: str | None = None) -> AssetInDB:
    return AssetInDB(
        id=asset_id, parent_id=parent_id, type=AssetType.ROOM, name=asset_id
    )


def _model(asset_id: str = "b1") -> BuildingModelInDB:
    return BuildingModelInDB(
        asset_id=asset_id,
        status=BuildingModelStatus.PROCESSING,
        filename="model.ifc",
    )


class TestBuildingModelStorage:
    async def test_save_and_get_reports_sizes(self):
        storage = MemoryAssetsStorage()
        await storage.save_model(_model(), b"ifc-bytes")

        meta = await storage.get_model("b1")
        assert meta is not None
        assert meta.ifc_size == len(b"ifc-bytes")
        assert meta.glb_size is None
        assert await storage.get_model_ifc("b1") == b"ifc-bytes"
        assert await storage.get_model_glb("b1") is None

    async def test_set_model_result_stores_outcome(self):
        storage = MemoryAssetsStorage()
        await storage.save_model(_model(), b"ifc-bytes")
        ready = _model().model_copy(
            update={
                "status": BuildingModelStatus.READY,
                "storeys": [ModelStorey(global_id="s1", name="Level 0")],
                "spaces": [ModelSpace(global_id="sp1", name="Room 001")],
            }
        )

        await storage.set_model_result(ready, b"glb-bytes")

        meta = await storage.get_model("b1")
        assert meta is not None
        assert meta.status == BuildingModelStatus.READY
        assert meta.ifc_size == len(b"ifc-bytes")  # preserved
        assert meta.glb_size == len(b"glb-bytes")
        assert [s.global_id for s in meta.storeys] == ["s1"]
        assert await storage.get_model_glb("b1") == b"glb-bytes"

    async def test_set_model_result_ignores_missing_row(self):
        storage = MemoryAssetsStorage()
        await storage.set_model_result(_model("ghost"), b"glb")
        assert await storage.get_model("ghost") is None

    async def test_fail_processing_models_only_touches_processing(self):
        storage = MemoryAssetsStorage()
        await storage.save_model(_model("a"), b"x")
        await storage.save_model(_model("b"), b"x")
        ready = _model("b").model_copy(update={"status": BuildingModelStatus.READY})
        await storage.set_model_result(ready, b"glb")

        await storage.fail_processing_models("interrupted", datetime.now(UTC))

        failed = await storage.get_model("a")
        untouched = await storage.get_model("b")
        assert failed is not None
        assert failed.status == BuildingModelStatus.FAILED
        assert failed.error == "interrupted"
        assert untouched is not None
        assert untouched.status == BuildingModelStatus.READY

    async def test_delete_model(self):
        storage = MemoryAssetsStorage()
        await storage.save_model(_model(), b"x")
        await storage.delete_model("b1")
        assert await storage.get_model("b1") is None

    async def test_deleting_the_asset_drops_its_model(self):
        storage = MemoryAssetsStorage()
        await storage.save(_asset("b1"))
        await storage.save_model(_model(), b"x")
        await storage.delete("b1")
        assert await storage.get_model("b1") is None


class TestDeleteDescendants:
    async def test_removes_subtree_and_their_models(self):
        storage = MemoryAssetsStorage()
        await storage.save(_asset("root"))
        await storage.save(_asset("b1", parent_id="root"))
        await storage.save(_asset("f1", parent_id="b1"))
        await storage.save(_asset("r1", parent_id="f1"))
        await storage.save(_asset("other", parent_id="root"))
        await storage.save_model(_model("f1"), b"x")

        await storage.delete_descendants("b1")

        assert await storage.get_by_id("b1") is not None
        assert await storage.get_by_id("f1") is None
        assert await storage.get_by_id("r1") is None
        assert await storage.get_by_id("other") is not None
        assert await storage.get_model("f1") is None
