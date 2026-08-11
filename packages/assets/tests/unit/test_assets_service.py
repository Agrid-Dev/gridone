import asyncio
from unittest.mock import patch

import pytest
import pytest_asyncio

from assets import AssetsService
from assets.models import (
    AssetCreate,
    AssetType,
    AssetUpdate,
    BuildingModelStatus,
    BuildingProfile,
)
from assets.storage import MemoryAssetsStorage
from models.errors import (
    InvalidError,
    NotFoundError,
    StorageConnectionError,
    UnsupportedStorageError,
)

pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def service():
    svc = AssetsService(storage_url=None)
    await svc.start()
    try:
        yield svc
    finally:
        await svc.stop()


async def _drain_conversions(service: AssetsService) -> None:
    """Wait for every in-flight background conversion to settle."""
    tasks = list(service._conversions.values())  # noqa: SLF001
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)


@pytest_asyncio.fixture
async def building(service: AssetsService):
    root = (await service.list_all())[0]
    return await service.create_asset(
        AssetCreate(parent_id=root.id, type=AssetType.BUILDING, name="HQ")
    )


class TestLifecycle:
    async def test_start_with_none_url_uses_memory_backend(self):
        svc = AssetsService(storage_url=None)
        await svc.start()
        try:
            assets = await svc.list_all()
            assert len(assets) == 1
            assert assets[0].parent_id is None
            assert assets[0].type == AssetType.ORG
            assert assets[0].name == "Organization"
        finally:
            await svc.stop()

    async def test_stop_is_idempotent(self):
        svc = AssetsService(storage_url=None)
        await svc.start()
        await svc.stop()
        await svc.stop()

    async def test_use_before_start_raises(self):
        svc = AssetsService(storage_url=None)
        with pytest.raises(RuntimeError, match=r"AssetsService\.start"):
            await svc.list_all()


class TestStorageURL:
    async def test_unknown_scheme_raises_unsupported(self):
        svc = AssetsService(storage_url="redis://localhost")
        with pytest.raises(UnsupportedStorageError):
            await svc.start()

    async def test_postgres_unreachable_raises_connection_error(self):
        with patch(
            "assets.storage.postgres.run_migrations",
            side_effect=OSError("boom"),
        ):
            svc = AssetsService(
                storage_url="postgresql://nobody:nobody@127.0.0.1:1/none"
            )
            with pytest.raises(StorageConnectionError):
                await svc.start()


class TestGetDescendants:
    async def test_returns_descendants(self, service: AssetsService) -> None:
        root = (await service.list_all())[0]
        building = await service.create_asset(
            AssetCreate(
                parent_id=root.id,
                type=AssetType.BUILDING,
                name="Building 1",
            )
        )
        floor = await service.create_asset(
            AssetCreate(
                parent_id=building.id,
                type=AssetType.FLOOR,
                name="Floor 1",
            )
        )

        result = await service.get_descendants(building.id)

        assert [asset.id for asset in result] == [floor.id]

    async def test_not_found(self, service: AssetsService) -> None:
        with pytest.raises(NotFoundError):
            await service.get_descendants("missing")


class TestMemoryTreeOperations:
    async def test_move_asset_refreshes_descendant_paths(
        self, service: AssetsService
    ) -> None:
        root = (await service.list_all())[0]
        building = await service.create_asset(
            AssetCreate(
                parent_id=root.id,
                type=AssetType.BUILDING,
                name="Building 1",
            )
        )
        other_building = await service.create_asset(
            AssetCreate(
                parent_id=root.id,
                type=AssetType.BUILDING,
                name="Building 2",
            )
        )
        floor = await service.create_asset(
            AssetCreate(
                parent_id=building.id,
                type=AssetType.FLOOR,
                name="Floor 1",
            )
        )

        await service.update_asset(floor.id, AssetUpdate(parent_id=other_building.id))

        old_descendants = await service.get_descendants(building.id)
        new_descendants = await service.get_descendants(other_building.id)
        assert old_descendants == []
        assert [asset.id for asset in new_descendants] == [floor.id]

    async def test_reorder_siblings_updates_memory_positions(
        self, service: AssetsService
    ) -> None:
        root = (await service.list_all())[0]
        first = await service.create_asset(
            AssetCreate(
                parent_id=root.id,
                type=AssetType.BUILDING,
                name="Building 1",
            )
        )
        second = await service.create_asset(
            AssetCreate(
                parent_id=root.id,
                type=AssetType.BUILDING,
                name="Building 2",
            )
        )

        await service.reorder_siblings(root.id, [second.id, first.id])

        siblings = await service.list_all(parent_id=root.id)
        assert [asset.id for asset in siblings] == [second.id, first.id]

    async def test_reorder_siblings_bumps_updated_at(
        self, service: AssetsService
    ) -> None:
        root = (await service.list_all())[0]
        first = await service.create_asset(
            AssetCreate(parent_id=root.id, type=AssetType.BUILDING, name="Building 1")
        )
        second = await service.create_asset(
            AssetCreate(parent_id=root.id, type=AssetType.BUILDING, name="Building 2")
        )

        await service.reorder_siblings(root.id, [second.id, first.id])

        siblings = {a.id: a for a in await service.list_all(parent_id=root.id)}
        assert siblings[first.id].updated_at > first.updated_at
        assert siblings[second.id].updated_at > second.updated_at


class TestResourceMetadata:
    async def test_create_asset_sets_both_timestamps(
        self, service: AssetsService
    ) -> None:
        root = (await service.list_all())[0]
        building = await service.create_asset(
            AssetCreate(parent_id=root.id, type=AssetType.BUILDING, name="Building 1")
        )
        assert building.created_at is not None
        assert building.updated_at is not None

    async def test_update_asset_keeps_created_at_bumps_updated_at(
        self, service: AssetsService
    ) -> None:
        root = (await service.list_all())[0]
        building = await service.create_asset(
            AssetCreate(parent_id=root.id, type=AssetType.BUILDING, name="Building 1")
        )
        updated = await service.update_asset(
            building.id, AssetUpdate(name="Renamed Building")
        )
        assert updated.created_at == building.created_at
        assert updated.updated_at > building.updated_at


class TestBuildingProfile:
    async def test_get_returns_empty_default_when_unset(self, service: AssetsService):
        profile = await service.get_profile()
        assert profile == BuildingProfile()

    async def test_set_then_get_persists_values(self, service: AssetsService):
        await service.set_profile(BuildingProfile(name="HQ", floors=3, latitude=48.85))
        profile = await service.get_profile()
        assert profile.name == "HQ"
        assert profile.floors == 3
        assert profile.latitude == 48.85

    async def test_partial_update_only_modifies_provided_fields(
        self, service: AssetsService
    ):
        await service.set_profile(BuildingProfile(name="HQ", floors=3))
        await service.set_profile(BuildingProfile(name="HQ Tower"))
        profile = await service.get_profile()
        assert profile.name == "HQ Tower"
        assert profile.floors == 3  # untouched, not reset to null

    async def test_explicit_null_clears_a_field(self, service: AssetsService):
        await service.set_profile(BuildingProfile(name="HQ", floors=3))
        await service.set_profile(BuildingProfile(floors=None))
        profile = await service.get_profile()
        assert profile.name == "HQ"  # untouched
        assert profile.floors is None  # explicitly cleared


class TestMemoryBackend:
    async def test_memory_storage_satisfies_protocol(self):
        storage = MemoryAssetsStorage()
        assets = await storage.list_all()
        assert assets == []
        await storage.close()


class TestUpdateAssetIfcGlobalId:
    async def test_set_and_preserve_when_omitted(self, service, building):
        await service.update_asset(building.id, AssetUpdate(ifc_global_id="GID-1"))
        renamed = await service.update_asset(building.id, AssetUpdate(name="HQ 2"))
        assert renamed.ifc_global_id == "GID-1"

    async def test_explicit_null_clears_the_link(self, service, building):
        await service.update_asset(building.id, AssetUpdate(ifc_global_id="GID-1"))
        cleared = await service.update_asset(
            building.id, AssetUpdate(ifc_global_id=None)
        )
        assert cleared.ifc_global_id is None


class TestBuildingModelLifecycle:
    async def test_upload_converts_to_ready(self, service, building, sample_ifc_bytes):
        model = await service.upload_model(
            building.id, filename="hq.ifc", data=sample_ifc_bytes
        )
        assert model.status == BuildingModelStatus.PROCESSING
        assert model.filename == "hq.ifc"
        assert model.ifc_size == len(sample_ifc_bytes)

        await _drain_conversions(service)

        ready = await service.get_model(building.id)
        assert ready.status == BuildingModelStatus.READY
        assert ready.error is None
        assert ready.glb_size is not None
        assert ready.glb_size > 0
        assert [s.name for s in ready.storeys] == ["Level 0", "Level 1"]
        assert [s.name for s in ready.spaces] == ["Room 001", "Room 101"]

        glb = await service.get_model_glb(building.id)
        assert glb.startswith(b"glTF")
        spaces = await service.get_model_spaces(building.id)
        assert [s.name for s in spaces] == ["Room 001", "Room 101"]

    async def test_invalid_payload_ends_failed_with_readable_error(
        self, service, building
    ):
        await service.upload_model(building.id, filename="junk.ifc", data=b"garbage")
        await _drain_conversions(service)

        model = await service.get_model(building.id)
        assert model.status == BuildingModelStatus.FAILED
        assert model.error == "The uploaded file is not a valid IFC file."
        with pytest.raises(NotFoundError):
            await service.get_model_glb(building.id)

    async def test_replace_upload_wins(self, service, building, sample_ifc_bytes):
        await service.upload_model(building.id, filename="old.ifc", data=b"garbage")
        await service.upload_model(
            building.id, filename="new.ifc", data=sample_ifc_bytes
        )
        await _drain_conversions(service)

        model = await service.get_model(building.id)
        assert model.filename == "new.ifc"
        assert model.status == BuildingModelStatus.READY

    async def test_upload_rejects_non_building(self, service, building):
        floor = await service.create_asset(
            AssetCreate(parent_id=building.id, type=AssetType.FLOOR, name="F1")
        )
        with pytest.raises(InvalidError, match="building"):
            await service.upload_model(floor.id, filename="f.ifc", data=b"data")

    async def test_upload_rejects_empty_and_oversized(
        self, service, building, monkeypatch
    ):
        with pytest.raises(InvalidError, match="empty"):
            await service.upload_model(building.id, filename="e.ifc", data=b"")
        monkeypatch.setattr("assets.service.MAX_IFC_BYTES", 4)
        with pytest.raises(InvalidError, match="200 MB"):
            await service.upload_model(building.id, filename="big.ifc", data=b"12345")

    async def test_get_model_not_found(self, service, building):
        with pytest.raises(NotFoundError):
            await service.get_model(building.id)
        with pytest.raises(NotFoundError):
            await service.get_model("missing")

    async def test_delete_model(self, service, building, sample_ifc_bytes):
        await service.upload_model(
            building.id, filename="hq.ifc", data=sample_ifc_bytes
        )
        await _drain_conversions(service)
        await service.delete_model(building.id)
        with pytest.raises(NotFoundError):
            await service.get_model(building.id)

    async def test_stop_cancels_inflight_conversions(self, sample_ifc_bytes):
        svc = AssetsService(storage_url=None)
        await svc.start()
        root = (await svc.list_all())[0]
        building = await svc.create_asset(
            AssetCreate(parent_id=root.id, type=AssetType.BUILDING, name="HQ")
        )
        await svc.upload_model(building.id, filename="hq.ifc", data=sample_ifc_bytes)
        await svc.stop()
        assert svc._conversions == {}  # noqa: SLF001
        await svc.stop()  # still idempotent


class TestImportTree:
    async def _ready_model(self, service, building, sample_ifc_bytes) -> None:
        await service.upload_model(
            building.id, filename="hq.ifc", data=sample_ifc_bytes
        )
        await _drain_conversions(service)

    async def test_replaces_subtree_with_stamped_assets(
        self, service, building, sample_ifc_bytes
    ):
        old_floor = await service.create_asset(
            AssetCreate(parent_id=building.id, type=AssetType.FLOOR, name="Old floor")
        )
        await service.create_asset(
            AssetCreate(parent_id=old_floor.id, type=AssetType.ROOM, name="Old room")
        )
        await self._ready_model(service, building, sample_ifc_bytes)

        result = await service.import_tree(building.id)

        assert result.floors_created == 2
        assert result.rooms_created == 2
        descendants = await service.get_descendants(building.id)
        floors = sorted(
            (a for a in descendants if a.type == AssetType.FLOOR),
            key=lambda a: a.position,
        )
        rooms = sorted(
            (a for a in descendants if a.type == AssetType.ROOM), key=lambda a: a.name
        )
        assert [(f.name, f.position) for f in floors] == [
            ("Level 0", 0),
            ("Level 1", 1),
        ]
        assert [r.name for r in rooms] == ["Room 001", "Room 101"]
        assert all(a.ifc_global_id for a in descendants)
        assert not any(a.name.startswith("Old") for a in descendants)
        rooms_by_name = {r.name: r for r in rooms}
        floors_by_gid = {f.ifc_global_id: f for f in floors}
        model = await service.get_model(building.id)
        for space in model.spaces:
            room = rooms_by_name[space.name]
            assert room.parent_id == floors_by_gid[space.storey_global_id].id

    async def test_import_requires_building(self, service, building):
        floor = await service.create_asset(
            AssetCreate(parent_id=building.id, type=AssetType.FLOOR, name="F1")
        )
        with pytest.raises(InvalidError, match="building"):
            await service.import_tree(floor.id)

    async def test_import_requires_ready_model(self, service, building):
        with pytest.raises(NotFoundError):
            await service.import_tree(building.id)
        await service.upload_model(building.id, filename="junk.ifc", data=b"garbage")
        await _drain_conversions(service)
        with pytest.raises(InvalidError, match="not ready"):
            await service.import_tree(building.id)

    async def test_import_requires_storeys(self, service, building):
        from ifc_fixtures import build_ifc

        await service.upload_model(
            building.id, filename="flat.ifc", data=build_ifc(with_storeys=False)
        )
        await _drain_conversions(service)
        with pytest.raises(InvalidError, match="no storeys"):
            await service.import_tree(building.id)
