from unittest.mock import patch

import pytest
import pytest_asyncio

from assets import AssetsService
from assets.models import AssetCreate, AssetType, AssetUpdate
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


class TestMemoryBackend:
    async def test_memory_storage_satisfies_protocol(self):
        storage = MemoryAssetsStorage()
        assets = await storage.list_all()
        assert assets == []
        await storage.close()
