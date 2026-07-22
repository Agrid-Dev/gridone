from unittest.mock import patch

import pytest
import pytest_asyncio

from assets import AssetsService
from assets.models import AssetCreate, AssetType, AssetUpdate, BuildingProfile
from assets.storage import MemoryAssetsStorage
from models.errors import NotFoundError, StorageConnectionError, UnsupportedStorageError

pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def service():
    svc = AssetsService(storage_url=None)
    await svc.start()
    try:
        yield svc
    finally:
        await svc.stop()


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
