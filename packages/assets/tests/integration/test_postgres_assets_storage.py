from __future__ import annotations

import os

import asyncpg
import pytest
import pytest_asyncio
from assets.models import AssetType, DeviceAssetLink
from assets.storage.models import AssetInDB
from assets.storage.postgres.postgres_assets_storage import (
    PostgresAssetsStorage,
)

POSTGRES_URL = os.environ.get("POSTGRES_TEST_URL")

pytestmark = [
    pytest.mark.asyncio,
    pytest.mark.integration,
    pytest.mark.skipif(POSTGRES_URL is None, reason="POSTGRES_TEST_URL not set"),
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_asset(
    asset_id: str = "asset-1",
    *,
    parent_id: str | None = None,
    asset_type: AssetType = AssetType.BUILDING,
    name: str = "Asset 1",
    position: int = 0,
) -> AssetInDB:
    return AssetInDB(
        id=asset_id,
        parent_id=parent_id,
        type=asset_type,
        name=name,
        position=position,
    )


def _root(asset_id: str = "root-org", name: str = "Root Org") -> AssetInDB:
    """Convenience: a root-level org (no parent)."""
    return AssetInDB(
        id=asset_id,
        parent_id=None,
        type=AssetType.ORG,
        name=name,
        position=0,
    )


# ---------------------------------------------------------------------------
# Fixture
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def storage():
    pool = await asyncpg.create_pool(POSTGRES_URL)
    store = PostgresAssetsStorage(pool)
    await store.ensure_schema()

    # Clean tables before each test (links first due to FK)
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM device_asset_links")
        await conn.execute("DELETE FROM assets")

    yield store

    await pool.close()


# ===================================================================
# CRUD
# ===================================================================


class TestCreateReadUpdateDelete:
    """save (insert), get_by_id, list_all, list_by_parent, update, delete."""

    async def test_save_and_get_by_id(self, storage: PostgresAssetsStorage) -> None:
        root = _root()
        await storage.save(root)

        fetched = await storage.get_by_id(root.id)
        assert fetched is not None
        assert fetched.id == root.id
        assert fetched.name == root.name
        assert fetched.type == AssetType.ORG
        assert fetched.parent_id is None
        # Trigger should have computed a path
        assert len(fetched.path) >= 1

    async def test_get_by_id_not_found(self, storage: PostgresAssetsStorage) -> None:
        assert await storage.get_by_id("nonexistent") is None

    async def test_list_all_empty(self, storage: PostgresAssetsStorage) -> None:
        assert await storage.list_all() == []

    async def test_list_all(self, storage: PostgresAssetsStorage) -> None:
        root = _root()
        await storage.save(root)
        child = _make_asset("b1", parent_id=root.id, name="Building 1")
        await storage.save(child)

        all_assets = await storage.list_all()
        assert len(all_assets) == 2
        ids = {a.id for a in all_assets}
        assert ids == {root.id, child.id}

    async def test_list_by_parent_none(self, storage: PostgresAssetsStorage) -> None:
        """Roots: list_by_parent(None) returns only root assets."""
        root = _root()
        await storage.save(root)
        child = _make_asset("b1", parent_id=root.id, name="Building 1")
        await storage.save(child)

        roots = await storage.list_by_parent(None)
        assert len(roots) == 1
        assert roots[0].id == root.id

    async def test_list_by_parent(self, storage: PostgresAssetsStorage) -> None:
        root = _root()
        await storage.save(root)
        b1 = _make_asset("b1", parent_id=root.id, name="Building 1")
        b2 = _make_asset("b2", parent_id=root.id, name="Building 2", position=1)
        await storage.save(b1)
        await storage.save(b2)

        children = await storage.list_by_parent(root.id)
        assert len(children) == 2
        assert children[0].id == "b1"
        assert children[1].id == "b2"

    async def test_update_existing_asset(self, storage: PostgresAssetsStorage) -> None:
        """save() with an existing id updates name / type / position."""
        root = _root()
        await storage.save(root)

        updated = AssetInDB(
            id=root.id,
            parent_id=None,
            type=AssetType.ORG,
            name="Renamed Org",
            position=5,
        )
        await storage.save(updated)

        fetched = await storage.get_by_id(root.id)
        assert fetched is not None
        assert fetched.name == "Renamed Org"
        assert fetched.position == 5

    async def test_delete(self, storage: PostgresAssetsStorage) -> None:
        root = _root()
        await storage.save(root)
        await storage.delete(root.id)

        assert await storage.get_by_id(root.id) is None

    async def test_delete_nonexistent_is_noop(
        self, storage: PostgresAssetsStorage
    ) -> None:
        """Deleting a missing id should not raise."""
        await storage.delete("does-not-exist")


# ===================================================================
# Tree
# ===================================================================


class TestGetChildrenAndDescendants:
    """get_children, get_descendants, update_descendant_paths."""

    async def _seed_tree(
        self, storage: PostgresAssetsStorage
    ) -> tuple[AssetInDB, AssetInDB, AssetInDB, AssetInDB, AssetInDB]:
        """Build:  root -> b1 -> f1 -> r1
        \\-> f2
        """
        root = _root()
        b1 = _make_asset(
            "b1",
            parent_id=root.id,
            asset_type=AssetType.BUILDING,
            name="Building",
        )
        f1 = _make_asset(
            "f1",
            parent_id="b1",
            asset_type=AssetType.FLOOR,
            name="Floor 1",
        )
        f2 = _make_asset(
            "f2",
            parent_id="b1",
            asset_type=AssetType.FLOOR,
            name="Floor 2",
            position=1,
        )
        r1 = _make_asset(
            "r1",
            parent_id="f1",
            asset_type=AssetType.ROOM,
            name="Room 1",
        )
        for asset in (root, b1, f1, f2, r1):
            await storage.save(asset)
        return root, b1, f1, f2, r1

    async def test_get_children(self, storage: PostgresAssetsStorage) -> None:
        _root_a, b1, _f1, _f2, _r1 = await self._seed_tree(storage)

        children = await storage.get_children(b1.id)
        ids = {c.id for c in children}
        assert ids == {"f1", "f2"}

    async def test_get_children_leaf(self, storage: PostgresAssetsStorage) -> None:
        """A leaf node has no children."""
        await self._seed_tree(storage)
        assert await storage.get_children("r1") == []

    async def test_get_descendants(self, storage: PostgresAssetsStorage) -> None:
        root, _b1, _f1, _f2, _r1 = await self._seed_tree(storage)

        # Descendants of root = everything else
        desc = await storage.get_descendants(root.id)
        desc_ids = {d.id for d in desc}
        assert desc_ids == {"b1", "f1", "f2", "r1"}

    async def test_get_descendants_subtree(
        self, storage: PostgresAssetsStorage
    ) -> None:
        """Descendants of b1 should include f1, f2, r1."""
        await self._seed_tree(storage)

        desc = await storage.get_descendants("b1")
        desc_ids = {d.id for d in desc}
        assert desc_ids == {"f1", "f2", "r1"}

    async def test_get_descendants_leaf(self, storage: PostgresAssetsStorage) -> None:
        await self._seed_tree(storage)
        assert await storage.get_descendants("r1") == []

    async def test_update_descendant_paths_after_move(
        self, storage: PostgresAssetsStorage
    ) -> None:
        """Moving a subtree should cascade path updates."""
        await self._seed_tree(storage)

        # Create a second building and move f1 under it
        b2 = _make_asset(
            "b2",
            parent_id="root-org",
            asset_type=AssetType.BUILDING,
            name="Building 2",
            position=1,
        )
        await storage.save(b2)

        # Move f1 from b1 -> b2
        f1_moved = _make_asset(
            "f1",
            parent_id="b2",
            asset_type=AssetType.FLOOR,
            name="Floor 1",
        )
        await storage.save(f1_moved)
        await storage.update_descendant_paths("f1")

        # r1 (child of f1) should now have a path through b2
        r1 = await storage.get_by_id("r1")
        assert r1 is not None
        # Path should contain b2's sanitized id, not b1's
        assert "b2" in r1.path
        assert "b1" not in r1.path

    async def test_path_computed_by_trigger(
        self, storage: PostgresAssetsStorage
    ) -> None:
        """The DB trigger should auto-compute path on insert."""
        root = _root("org1", name="Org")
        await storage.save(root)
        child = _make_asset("child1", parent_id="org1", name="Child")
        await storage.save(child)

        fetched = await storage.get_by_id("child1")
        assert fetched is not None
        # Path should be [sanitized(org1), sanitized(child1)]
        assert len(fetched.path) == 2
        assert fetched.path[0] == "org1"
        assert fetched.path[1] == "child1"


# ===================================================================
# Ordering
# ===================================================================


class TestPositionAndReorder:
    """get_next_position, reorder_siblings."""

    async def test_get_next_position_empty(
        self, storage: PostgresAssetsStorage
    ) -> None:
        root = _root()
        await storage.save(root)
        assert await storage.get_next_position(root.id) == 0

    async def test_get_next_position_after_children(
        self, storage: PostgresAssetsStorage
    ) -> None:
        root = _root()
        await storage.save(root)
        await storage.save(_make_asset("b1", parent_id=root.id, name="B1", position=0))
        await storage.save(_make_asset("b2", parent_id=root.id, name="B2", position=1))
        assert await storage.get_next_position(root.id) == 2

    async def test_reorder_siblings(self, storage: PostgresAssetsStorage) -> None:
        root = _root()
        await storage.save(root)
        await storage.save(_make_asset("b1", parent_id=root.id, name="B1", position=0))
        await storage.save(_make_asset("b2", parent_id=root.id, name="B2", position=1))
        await storage.save(_make_asset("b3", parent_id=root.id, name="B3", position=2))

        # Reverse order
        await storage.reorder_siblings(root.id, ["b3", "b2", "b1"])

        children = await storage.get_children(root.id)
        assert [c.id for c in children] == ["b3", "b2", "b1"]

    async def test_reorder_empty_list(self, storage: PostgresAssetsStorage) -> None:
        """reorder_siblings with an empty list should be a no-op."""
        root = _root()
        await storage.save(root)
        await storage.reorder_siblings(root.id, [])


# ===================================================================
# Device links
# ===================================================================


class TestDeviceLinks:
    """link, unlink, query helpers, get_all_device_links."""

    async def _make_root_and_building(
        self, storage: PostgresAssetsStorage
    ) -> tuple[AssetInDB, AssetInDB]:
        root = _root()
        b1 = _make_asset("b1", parent_id=root.id, name="Building 1")
        await storage.save(root)
        await storage.save(b1)
        return root, b1

    async def test_link_and_get_device_ids(
        self, storage: PostgresAssetsStorage
    ) -> None:
        _, b1 = await self._make_root_and_building(storage)

        link = DeviceAssetLink(device_id="dev-1", asset_id=b1.id)
        await storage.link_device(link)

        device_ids = await storage.get_device_ids_for_asset(b1.id)
        assert device_ids == ["dev-1"]

    async def test_link_multiple_devices(self, storage: PostgresAssetsStorage) -> None:
        _, b1 = await self._make_root_and_building(storage)

        await storage.link_device(DeviceAssetLink(device_id="dev-1", asset_id=b1.id))
        await storage.link_device(DeviceAssetLink(device_id="dev-2", asset_id=b1.id))

        device_ids = await storage.get_device_ids_for_asset(b1.id)
        assert device_ids == ["dev-1", "dev-2"]

    async def test_link_idempotent(self, storage: PostgresAssetsStorage) -> None:
        """Linking the same device+asset twice should not raise."""
        _, b1 = await self._make_root_and_building(storage)
        link = DeviceAssetLink(device_id="dev-1", asset_id=b1.id)
        await storage.link_device(link)
        await storage.link_device(link)

        device_ids = await storage.get_device_ids_for_asset(b1.id)
        assert device_ids == ["dev-1"]

    async def test_unlink_device(self, storage: PostgresAssetsStorage) -> None:
        _, b1 = await self._make_root_and_building(storage)
        link = DeviceAssetLink(device_id="dev-1", asset_id=b1.id)
        await storage.link_device(link)
        await storage.unlink_device("dev-1", b1.id)

        assert await storage.get_device_ids_for_asset(b1.id) == []

    async def test_unlink_nonexistent_is_noop(
        self, storage: PostgresAssetsStorage
    ) -> None:
        _, b1 = await self._make_root_and_building(storage)
        await storage.unlink_device("ghost", b1.id)

    async def test_get_asset_ids_for_device(
        self, storage: PostgresAssetsStorage
    ) -> None:
        root, b1 = await self._make_root_and_building(storage)

        await storage.link_device(DeviceAssetLink(device_id="dev-1", asset_id=root.id))
        await storage.link_device(DeviceAssetLink(device_id="dev-1", asset_id=b1.id))

        asset_ids = await storage.get_asset_ids_for_device("dev-1")
        assert set(asset_ids) == {root.id, b1.id}

    async def test_get_all_device_links_empty(
        self, storage: PostgresAssetsStorage
    ) -> None:
        assert await storage.get_all_device_links() == {}

    async def test_get_all_device_links(self, storage: PostgresAssetsStorage) -> None:
        root, b1 = await self._make_root_and_building(storage)

        await storage.link_device(DeviceAssetLink(device_id="dev-1", asset_id=root.id))
        await storage.link_device(DeviceAssetLink(device_id="dev-2", asset_id=root.id))
        await storage.link_device(DeviceAssetLink(device_id="dev-3", asset_id=b1.id))

        links = await storage.get_all_device_links()
        assert links[root.id] == ["dev-1", "dev-2"]
        assert links[b1.id] == ["dev-3"]

    async def test_cascade_delete_removes_links(
        self, storage: PostgresAssetsStorage
    ) -> None:
        """Deleting an asset should cascade-delete its device links."""
        _, b1 = await self._make_root_and_building(storage)
        await storage.link_device(DeviceAssetLink(device_id="dev-1", asset_id=b1.id))

        await storage.delete(b1.id)

        assert await storage.get_all_device_links() == {}
