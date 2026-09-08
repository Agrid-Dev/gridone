import threading
from unittest.mock import patch

import pytest
import pytest_asyncio
from scene_fakes import FakeSceneConverter

from assets import AssetsService, BuildingModelsService
from assets.models import (
    Asset,
    AssetCreate,
    AssetType,
    AssetUpdate,
    AssetUsage,
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

_IFC = b"pretend-ifc-payload"


@pytest.fixture
def converter() -> FakeSceneConverter:
    return FakeSceneConverter()


@pytest_asyncio.fixture
async def models(converter: FakeSceneConverter):
    """The real models service behind a scripted converter.

    A stub would prove less: what these tests care about is that the tree
    reads storeys and spaces through this seam, not that a mock was called.
    """
    svc = BuildingModelsService(storage_url=None, converter=converter)
    await svc.start()
    try:
        yield svc
    finally:
        if converter.gate is not None:
            converter.gate.set()
        await svc.stop()


@pytest_asyncio.fixture
async def service(models: BuildingModelsService):
    svc = AssetsService(storage_url=None, models=models)
    await svc.start()
    try:
        yield svc
    finally:
        await svc.stop()


@pytest_asyncio.fixture
async def building(service: AssetsService):
    root = (await service.list_all())[0]
    return await service.create_asset(
        AssetCreate(parent_id=root.id, type=AssetType.BUILDING, name="HQ")
    )


class TestLifecycle:
    async def test_start_with_none_url_uses_memory_backend(self, models):
        svc = AssetsService(storage_url=None, models=models)
        await svc.start()
        try:
            assets = await svc.list_all()
            assert len(assets) == 1
            assert assets[0].parent_id is None
            assert assets[0].type == AssetType.ORG
            assert assets[0].name == "Organization"
        finally:
            await svc.stop()

    async def test_stop_is_idempotent(self, models):
        svc = AssetsService(storage_url=None, models=models)
        await svc.start()
        await svc.stop()
        await svc.stop()

    async def test_use_before_start_raises(self, models):
        svc = AssetsService(storage_url=None, models=models)
        with pytest.raises(RuntimeError, match=r"AssetsService\.start"):
            await svc.list_all()


class TestStorageURL:
    async def test_unknown_scheme_raises_unsupported(self, models):
        svc = AssetsService("redis://localhost", models)
        with pytest.raises(UnsupportedStorageError):
            await svc.start()

    async def test_postgres_unreachable_raises_connection_error(self, models):
        with patch(
            "assets.storage.postgres.run_migrations",
            side_effect=OSError("boom"),
        ):
            svc = AssetsService("postgresql://nobody:nobody@127.0.0.1:1/none", models)
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


async def _create(
    service: AssetsService,
    parent_id: str,
    asset_type: AssetType,
    name: str,
    usage: AssetUsage | None = None,
) -> Asset:
    return await service.create_asset(
        AssetCreate(parent_id=parent_id, type=asset_type, name=name, usage=usage)
    )


@pytest_asyncio.fixture
async def floor(service: AssetsService) -> Asset:
    """root -> building -> floor, the parent every usage test hangs rooms off."""
    root = (await service.list_all())[0]
    building = await _create(service, root.id, AssetType.BUILDING, "Building")
    return await _create(service, building.id, AssetType.FLOOR, "Floor 1")


class TestUsageOnCreate:
    @pytest.mark.parametrize("asset_type", [AssetType.ROOM, AssetType.ZONE])
    async def test_room_and_zone_store_usage(
        self, service: AssetsService, floor: Asset, asset_type: AssetType
    ) -> None:
        created = await _create(
            service, floor.id, asset_type, "Space", AssetUsage.HOTEL_ROOM
        )
        assert created.usage == AssetUsage.HOTEL_ROOM
        assert (await service.get_by_id(created.id)).usage == AssetUsage.HOTEL_ROOM

    async def test_unclassified_by_default(
        self, service: AssetsService, floor: Asset
    ) -> None:
        room = await _create(service, floor.id, AssetType.ROOM, "Room")
        assert room.usage is None

    @pytest.mark.parametrize(
        "asset_type", [AssetType.ORG, AssetType.BUILDING, AssetType.FLOOR]
    )
    async def test_other_levels_reject_usage_and_store_nothing(
        self, service: AssetsService, floor: Asset, asset_type: AssetType
    ) -> None:
        before = len(await service.list_all())
        with pytest.raises(InvalidError, match="Only room and zone assets"):
            await _create(service, floor.id, asset_type, "Nope", AssetUsage.OFFICE)
        assert len(await service.list_all()) == before


class TestUsageOnUpdate:
    async def test_sets_usage_on_a_room(
        self, service: AssetsService, floor: Asset
    ) -> None:
        room = await _create(service, floor.id, AssetType.ROOM, "Room")
        updated = await service.update_asset(
            room.id, AssetUpdate(usage=AssetUsage.HOTEL_ROOM)
        )
        assert updated.usage == AssetUsage.HOTEL_ROOM
        assert (await service.get_by_id(room.id)).usage == AssetUsage.HOTEL_ROOM

    async def test_omitting_usage_keeps_it(
        self, service: AssetsService, floor: Asset
    ) -> None:
        room = await _create(
            service, floor.id, AssetType.ROOM, "Room", AssetUsage.HOTEL_ROOM
        )
        updated = await service.update_asset(room.id, AssetUpdate(name="Renamed"))
        assert updated.name == "Renamed"
        assert updated.usage == AssetUsage.HOTEL_ROOM

    async def test_explicit_null_clears_usage(
        self, service: AssetsService, floor: Asset
    ) -> None:
        room = await _create(
            service, floor.id, AssetType.ROOM, "Room", AssetUsage.HOTEL_ROOM
        )
        updated = await service.update_asset(room.id, AssetUpdate(usage=None))
        assert updated.usage is None

    async def test_floor_rejects_usage_and_stays_unchanged(
        self, service: AssetsService, floor: Asset
    ) -> None:
        with pytest.raises(InvalidError, match="Only room and zone assets"):
            await service.update_asset(
                floor.id, AssetUpdate(name="Changed", usage=AssetUsage.OFFICE)
            )
        stored = await service.get_by_id(floor.id)
        assert stored.name == "Floor 1"
        assert stored.usage is None

    async def test_retyping_a_classified_zone_asks_to_clear_first(
        self, service: AssetsService, floor: Asset
    ) -> None:
        zone = await _create(
            service, floor.id, AssetType.ZONE, "Zone", AssetUsage.HOTEL_ROOM
        )
        with pytest.raises(InvalidError, match="Clear its usage first"):
            await service.update_asset(zone.id, AssetUpdate(type=AssetType.FLOOR))
        stored = await service.get_by_id(zone.id)
        assert stored.type == AssetType.ZONE
        assert stored.usage == AssetUsage.HOTEL_ROOM

    async def test_retyping_with_an_explicit_null_usage_is_allowed(
        self, service: AssetsService, floor: Asset
    ) -> None:
        zone = await _create(
            service, floor.id, AssetType.ZONE, "Zone", AssetUsage.HOTEL_ROOM
        )
        updated = await service.update_asset(
            zone.id, AssetUpdate(type=AssetType.FLOOR, usage=None)
        )
        assert updated.type == AssetType.FLOOR
        assert updated.usage is None

    async def test_retyping_between_room_and_zone_keeps_usage(
        self, service: AssetsService, floor: Asset
    ) -> None:
        room = await _create(
            service, floor.id, AssetType.ROOM, "Room", AssetUsage.HOTEL_ROOM
        )
        updated = await service.update_asset(room.id, AssetUpdate(type=AssetType.ZONE))
        assert updated.type == AssetType.ZONE
        assert updated.usage == AssetUsage.HOTEL_ROOM


class TestUsageQueries:
    async def test_list_all_filters_by_usage(
        self, service: AssetsService, floor: Asset
    ) -> None:
        bedroom = await _create(
            service, floor.id, AssetType.ROOM, "201", AssetUsage.HOTEL_ROOM
        )
        await _create(service, floor.id, AssetType.ROOM, "Bar", AssetUsage.RESTAURANT)
        await _create(service, floor.id, AssetType.ROOM, "Unclassified")

        result = await service.list_all(usage=AssetUsage.HOTEL_ROOM)

        assert [a.id for a in result] == [bedroom.id]

    async def test_usage_filter_combines_with_parent_and_type(
        self, service: AssetsService, floor: Asset
    ) -> None:
        zone = await _create(service, floor.id, AssetType.ZONE, "Z", AssetUsage.OFFICE)
        await _create(service, floor.id, AssetType.ROOM, "R", AssetUsage.OFFICE)

        result = await service.list_all(
            parent_id=floor.id, asset_type="zone", usage=AssetUsage.OFFICE
        )

        assert [a.id for a in result] == [zone.id]

    async def test_tree_nodes_carry_usage(
        self, service: AssetsService, floor: Asset
    ) -> None:
        await _create(service, floor.id, AssetType.ROOM, "201", AssetUsage.HOTEL_ROOM)
        tree = await service.get_tree()
        room_node = tree[0]["children"][0]["children"][0]["children"][0]
        assert room_node["usage"] == AssetUsage.HOTEL_ROOM


class TestSetUsageBatch:
    @pytest_asyncio.fixture
    async def rooms(self, service: AssetsService, floor: Asset) -> list[Asset]:
        return [
            await _create(service, floor.id, AssetType.ROOM, f"Room {n}")
            for n in range(3)
        ]

    async def test_classifies_every_asset_and_counts_them(
        self, service: AssetsService, rooms: list[Asset]
    ) -> None:
        ids = [room.id for room in rooms]
        updated = await service.set_usage(ids, AssetUsage.COMMON_AREA)
        assert updated == 3
        for asset_id in ids:
            assert (await service.get_by_id(asset_id)).usage == AssetUsage.COMMON_AREA

    async def test_bumps_updated_at(
        self, service: AssetsService, rooms: list[Asset]
    ) -> None:
        await service.set_usage([rooms[0].id], AssetUsage.OFFICE)
        assert (await service.get_by_id(rooms[0].id)).updated_at > rooms[0].updated_at

    async def test_counts_distinct_ids(
        self, service: AssetsService, rooms: list[Asset]
    ) -> None:
        updated = await service.set_usage([rooms[0].id, rooms[0].id], AssetUsage.OTHER)
        assert updated == 1

    async def test_null_clears_usage(
        self, service: AssetsService, rooms: list[Asset]
    ) -> None:
        ids = [room.id for room in rooms]
        await service.set_usage(ids, AssetUsage.OFFICE)
        await service.set_usage(ids, None)
        for asset_id in ids:
            assert (await service.get_by_id(asset_id)).usage is None

    async def test_one_floor_id_rejects_the_whole_batch(
        self, service: AssetsService, floor: Asset, rooms: list[Asset]
    ) -> None:
        ids = [room.id for room in rooms]
        with pytest.raises(InvalidError, match="Only room and zone assets"):
            await service.set_usage([*ids, floor.id], AssetUsage.COMMON_AREA)
        for asset_id in ids:
            assert (await service.get_by_id(asset_id)).usage is None

    async def test_unknown_id_rejects_the_whole_batch(
        self, service: AssetsService, rooms: list[Asset]
    ) -> None:
        ids = [room.id for room in rooms]
        with pytest.raises(NotFoundError):
            await service.set_usage([*ids, "missing"], AssetUsage.COMMON_AREA)
        for asset_id in ids:
            assert (await service.get_by_id(asset_id)).usage is None


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


class TestBuildingModelOwnership:
    """The one part of a 3D model the asset tree owns: who may carry one."""

    async def test_upload_delegates_to_the_models_service(
        self, service, models, building
    ):
        model = await service.upload_model(building.id, filename="hq.ifc", data=_IFC)
        assert model.asset_id == building.id
        assert (await models.get(building.id)).filename == "hq.ifc"

    async def test_upload_rejects_a_non_building(self, service, models, building):
        floor = await service.create_asset(
            AssetCreate(parent_id=building.id, type=AssetType.FLOOR, name="F1")
        )
        with pytest.raises(InvalidError, match="building"):
            await service.upload_model(floor.id, filename="f.ifc", data=_IFC)
        with pytest.raises(NotFoundError):
            await models.get(floor.id)

    async def test_upload_to_an_unknown_asset_is_not_found(self, service):
        with pytest.raises(NotFoundError):
            await service.upload_model("ghost", filename="f.ifc", data=_IFC)

    async def test_deleting_the_asset_drops_its_model(self, service, models, building):
        await service.upload_model(building.id, filename="hq.ifc", data=_IFC)
        await models.wait_for_conversions()

        await service.delete_asset(building.id)

        with pytest.raises(NotFoundError):
            await models.get(building.id)


class TestImportTree:
    async def _ready_model(self, service, models, building) -> None:
        await service.upload_model(building.id, filename="hq.ifc", data=_IFC)
        await models.wait_for_conversions()

    @staticmethod
    async def _rooms_by_name(service, building) -> dict:
        return {
            a.name: a
            for a in await service.get_descendants(building.id)
            if a.type == AssetType.ROOM
        }

    async def test_replaces_subtree_with_stamped_assets(
        self, service, models, building
    ):
        old_floor = await service.create_asset(
            AssetCreate(parent_id=building.id, type=AssetType.FLOOR, name="Old floor")
        )
        await service.create_asset(
            AssetCreate(parent_id=old_floor.id, type=AssetType.ROOM, name="Old room")
        )
        await self._ready_model(service, models, building)

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
        model = await models.get(building.id)
        for space in model.spaces:
            room = rooms_by_name[space.name]
            assert room.parent_id == floors_by_gid[space.storey_global_id].id

    async def test_reimport_preserves_hand_set_usages(self, service, models, building):
        await self._ready_model(service, models, building)
        await service.import_tree(building.id)
        before = await self._rooms_by_name(service, building)
        await service.set_usage([before["Room 001"].id], AssetUsage.HOTEL_ROOM)

        await service.import_tree(building.id)

        after = await self._rooms_by_name(service, building)
        # The room is genuinely recreated, but the GlobalId matches, so the
        # hand-set classification rides along instead of being wiped.
        assert after["Room 001"].id != before["Room 001"].id
        assert after["Room 001"].ifc_global_id == before["Room 001"].ifc_global_id
        assert after["Room 001"].usage == AssetUsage.HOTEL_ROOM
        assert after["Room 101"].usage is None

    async def test_reimport_drops_usages_with_no_matching_global_id(
        self, service, models, building
    ):
        stray = await service.create_asset(
            AssetCreate(parent_id=building.id, type=AssetType.ROOM, name="Stray")
        )
        await service.set_usage([stray.id], AssetUsage.OFFICE)
        await self._ready_model(service, models, building)

        await service.import_tree(building.id)

        descendants = await service.get_descendants(building.id)
        # A hand-made room carries no GlobalId, so it has nothing to match on:
        # it goes away with the subtree and leaks its usage to no one.
        assert not any(a.name == "Stray" for a in descendants)
        assert all(a.usage is None for a in descendants)

    async def test_import_requires_building(self, service, building):
        floor = await service.create_asset(
            AssetCreate(parent_id=building.id, type=AssetType.FLOOR, name="F1")
        )
        with pytest.raises(InvalidError, match="building"):
            await service.import_tree(floor.id)

    async def test_import_requires_a_model(self, service, building):
        with pytest.raises(NotFoundError):
            await service.import_tree(building.id)

    async def test_import_requires_ready_model(self, service, converter, building):
        converter.gate = threading.Event()
        await service.upload_model(building.id, filename="hq.ifc", data=_IFC)
        with pytest.raises(InvalidError, match="not ready"):
            await service.import_tree(building.id)

    async def test_import_requires_storeys(self):
        models = BuildingModelsService(None, FakeSceneConverter(storeys=[], spaces=[]))
        await models.start()
        svc = AssetsService(None, models)
        await svc.start()
        try:
            root = (await svc.list_all())[0]
            flat = await svc.create_asset(
                AssetCreate(parent_id=root.id, type=AssetType.BUILDING, name="Flat")
            )
            await svc.upload_model(flat.id, filename="flat.ifc", data=_IFC)
            await models.wait_for_conversions()
            with pytest.raises(InvalidError, match="no storeys"):
                await svc.import_tree(flat.id)
        finally:
            await svc.stop()
            await models.stop()
