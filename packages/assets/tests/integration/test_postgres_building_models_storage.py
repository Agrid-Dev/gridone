from __future__ import annotations

import os
from datetime import UTC, datetime

import asyncpg
import pytest
import pytest_asyncio

from assets.models import AssetType, BuildingModelStatus, ModelSpace, ModelStorey
from assets.storage.models import AssetInDB, BuildingModelInDB
from assets.storage.postgres import run_migrations
from assets.storage.postgres.postgres_assets_storage import PostgresAssetsStorage
from assets.storage.postgres.postgres_building_models_storage import (
    PostgresBuildingModelsStorage,
)

POSTGRES_URL = os.environ.get("POSTGRES_TEST_URL")

pytestmark = [
    pytest.mark.asyncio,
    pytest.mark.integration,
    pytest.mark.skipif(POSTGRES_URL is None, reason="POSTGRES_TEST_URL not set"),
]


def _model(asset_id: str = "b1") -> BuildingModelInDB:
    return BuildingModelInDB(
        asset_id=asset_id,
        status=BuildingModelStatus.PROCESSING,
        filename="model.ifc",
    )


@pytest_asyncio.fixture
async def storages():
    """Both stores over one pool: ``building_models`` has an FK to ``assets``.

    The model store never reads the tree, but a row cannot exist without its
    asset — so the assets store is here to seed the building the model hangs
    from, not because the two are otherwise related.
    """
    assert POSTGRES_URL is not None
    run_migrations(POSTGRES_URL)
    pool = await asyncpg.create_pool(POSTGRES_URL)

    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM device_asset_links")
        await conn.execute("DELETE FROM building_models")
        await conn.execute("DELETE FROM assets")

    yield PostgresBuildingModelsStorage(pool), PostgresAssetsStorage(pool)

    await pool.close()


async def _seed_building(assets: PostgresAssetsStorage, asset_id: str = "b1") -> None:
    await assets.save(
        AssetInDB(id="root-org", parent_id=None, type=AssetType.ORG, name="Root Org")
    )
    await assets.save(
        AssetInDB(
            id=asset_id,
            parent_id="root-org",
            type=AssetType.BUILDING,
            name=asset_id,
        )
    )


class TestBuildingModels:
    """building_models bytea/jsonb round-trips and lifecycle transitions."""

    async def test_save_and_get_meta_with_sizes(self, storages) -> None:
        models, assets = storages
        await _seed_building(assets)
        await models.save(_model(), b"ifc-payload")

        meta = await models.get("b1")
        assert meta is not None
        assert meta.status == BuildingModelStatus.PROCESSING
        assert meta.filename == "model.ifc"
        assert meta.ifc_size == len(b"ifc-payload")
        assert meta.glb_size is None
        assert meta.storeys == []
        assert await models.get_ifc("b1") == b"ifc-payload"
        assert await models.get_glb("b1") is None

    async def test_set_result_round_trips_jsonb(self, storages) -> None:
        models, assets = storages
        await _seed_building(assets)
        await models.save(_model(), b"ifc-payload")
        ready = _model().model_copy(
            update={
                "status": BuildingModelStatus.READY,
                "storeys": [ModelStorey(global_id="s1", name="Level 0", elevation=0.0)],
                "spaces": [
                    ModelSpace(
                        global_id="sp1",
                        name="Room 001",
                        storey_global_id="s1",
                        storey_name="Level 0",
                    )
                ],
                "updated_at": datetime.now(UTC),
            }
        )

        await models.set_result(ready, b"glb-payload")

        meta = await models.get("b1")
        assert meta is not None
        assert meta.status == BuildingModelStatus.READY
        assert meta.ifc_size == len(b"ifc-payload")
        assert meta.glb_size == len(b"glb-payload")
        assert meta.storeys == ready.storeys
        assert meta.spaces == ready.spaces
        assert await models.get_glb("b1") == b"glb-payload"

    async def test_replacing_upload_resets_result(self, storages) -> None:
        models, assets = storages
        await _seed_building(assets)
        await models.save(_model(), b"first")
        ready = _model().model_copy(update={"status": BuildingModelStatus.READY})
        await models.set_result(ready, b"glb-payload")

        await models.save(
            _model().model_copy(update={"filename": "second.ifc"}), b"second!"
        )

        meta = await models.get("b1")
        assert meta is not None
        assert meta.status == BuildingModelStatus.PROCESSING
        assert meta.filename == "second.ifc"
        assert meta.ifc_size == len(b"second!")
        assert meta.glb_size is None
        assert await models.get_glb("b1") is None

    async def test_fail_processing(self, storages) -> None:
        models, assets = storages
        await _seed_building(assets, "b1")
        await _seed_building(assets, "b2")
        await models.save(_model("b1"), b"x")
        await models.save(_model("b2"), b"x")
        ready = _model("b2").model_copy(update={"status": BuildingModelStatus.READY})
        await models.set_result(ready, b"glb")

        await models.fail_processing("interrupted", datetime.now(UTC))

        failed = await models.get("b1")
        untouched = await models.get("b2")
        assert failed is not None
        assert failed.status == BuildingModelStatus.FAILED
        assert failed.error == "interrupted"
        assert untouched is not None
        assert untouched.status == BuildingModelStatus.READY

    async def test_converter_version_round_trips_and_lists_stale(
        self, storages
    ) -> None:
        models, assets = storages
        for asset_id, version in (("old", 1), ("current", 3)):
            await _seed_building(assets, asset_id)
            await models.save(_model(asset_id), b"x")
            await models.set_result(
                _model(asset_id).model_copy(
                    update={
                        "status": BuildingModelStatus.READY,
                        "converter_version": version,
                    }
                ),
                b"glb",
            )

        old_meta = await models.get("old")
        assert old_meta is not None
        assert old_meta.converter_version == 1
        assert await models.list_stale_ready_ids(3) == ["old"]

    async def test_delete(self, storages) -> None:
        models, assets = storages
        await _seed_building(assets)
        await models.save(_model(), b"x")
        await models.delete("b1")
        assert await models.get("b1") is None

    async def test_delete_many_ignores_assets_without_a_model(self, storages) -> None:
        models, assets = storages
        await _seed_building(assets, "b1")
        await _seed_building(assets, "b2")
        await models.save(_model("b1"), b"x")
        await models.save(_model("b2"), b"x")

        await models.delete_many(["b1", "ghost"])

        assert await models.get("b1") is None
        assert await models.get("b2") is not None

    async def test_deleting_the_asset_cascades(self, storages) -> None:
        """The FK backstop. The service also deletes explicitly, so that every
        backend agrees — this pins the database half of that contract."""
        models, assets = storages
        await _seed_building(assets)
        await models.save(_model(), b"x")
        await assets.delete("b1")
        assert await models.get("b1") is None
