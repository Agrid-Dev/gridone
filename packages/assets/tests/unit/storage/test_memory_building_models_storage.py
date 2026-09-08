from datetime import UTC, datetime

import pytest

from assets.models import BuildingModelStatus, ModelSpace, ModelStorey
from assets.storage.memory_building_models import MemoryBuildingModelsStorage
from assets.storage.models import BuildingModelInDB

pytestmark = pytest.mark.asyncio


def _model(asset_id: str = "b1") -> BuildingModelInDB:
    return BuildingModelInDB(
        asset_id=asset_id,
        status=BuildingModelStatus.PROCESSING,
        filename="model.ifc",
    )


class TestBuildingModelStorage:
    async def test_save_and_get_reports_sizes(self):
        storage = MemoryBuildingModelsStorage()
        await storage.save(_model(), b"ifc-bytes")

        meta = await storage.get("b1")
        assert meta is not None
        assert meta.ifc_size == len(b"ifc-bytes")
        assert meta.glb_size is None
        assert await storage.get_ifc("b1") == b"ifc-bytes"
        assert await storage.get_glb("b1") is None

    async def test_set_result_stores_outcome(self):
        storage = MemoryBuildingModelsStorage()
        await storage.save(_model(), b"ifc-bytes")
        ready = _model().model_copy(
            update={
                "status": BuildingModelStatus.READY,
                "storeys": [ModelStorey(global_id="s1", name="Level 0")],
                "spaces": [ModelSpace(global_id="sp1", name="Room 001")],
            }
        )

        await storage.set_result(ready, b"glb-bytes")

        meta = await storage.get("b1")
        assert meta is not None
        assert meta.status == BuildingModelStatus.READY
        assert meta.ifc_size == len(b"ifc-bytes")
        assert meta.glb_size == len(b"glb-bytes")
        assert [s.name for s in meta.storeys] == ["Level 0"]
        assert [s.name for s in meta.spaces] == ["Room 001"]
        assert await storage.get_glb("b1") == b"glb-bytes"

    async def test_set_result_ignores_missing_row(self):
        storage = MemoryBuildingModelsStorage()
        await storage.set_result(_model("ghost"), b"glb")
        assert await storage.get("ghost") is None

    async def test_set_result_persists_converter_version(self):
        storage = MemoryBuildingModelsStorage()
        await storage.save(_model(), b"ifc")
        ready = _model().model_copy(
            update={
                "status": BuildingModelStatus.READY,
                "converter_version": 7,
            }
        )

        await storage.set_result(ready, b"glb")

        meta = await storage.get("b1")
        assert meta is not None
        assert meta.converter_version == 7

    async def test_list_stale_ready_ids_only_returns_older_ready(self):
        storage = MemoryBuildingModelsStorage()
        for asset_id, status, version in [
            ("stale", BuildingModelStatus.READY, 1),
            ("current", BuildingModelStatus.READY, 3),
            ("processing", BuildingModelStatus.PROCESSING, 1),
        ]:
            await storage.save(_model(asset_id), b"ifc")
            await storage.set_result(
                _model(asset_id).model_copy(
                    update={"status": status, "converter_version": version}
                ),
                b"glb",
            )

        assert await storage.list_stale_ready_ids(3) == ["stale"]

    async def test_fail_processing_only_touches_processing(self):
        storage = MemoryBuildingModelsStorage()
        await storage.save(_model("a"), b"x")
        await storage.save(_model("b"), b"x")
        ready = _model("b").model_copy(update={"status": BuildingModelStatus.READY})
        await storage.set_result(ready, b"glb")

        await storage.fail_processing("interrupted", datetime.now(UTC))

        failed = await storage.get("a")
        untouched = await storage.get("b")
        assert failed is not None
        assert failed.status == BuildingModelStatus.FAILED
        assert failed.error == "interrupted"
        assert untouched is not None
        assert untouched.status == BuildingModelStatus.READY

    async def test_delete(self):
        storage = MemoryBuildingModelsStorage()
        await storage.save(_model(), b"x")
        await storage.delete("b1")
        assert await storage.get("b1") is None

    async def test_delete_many_ignores_assets_without_a_model(self):
        storage = MemoryBuildingModelsStorage()
        await storage.save(_model("b1"), b"x")
        await storage.save(_model("b2"), b"x")

        await storage.delete_many(["b1", "ghost"])

        assert await storage.get("b1") is None
        assert await storage.get("b2") is not None
