"""Tests for users.authorization.AuthorizationService."""

from __future__ import annotations

import pytest

from users.authorization import AuthorizationService
from users.authorization_models import (
    Permission,
    Role,
    UserRoleAssignment,
)

from conftest import MemoryAuthorizationStorage


# ── Fake asset hierarchy ──────────────────────────────────────────────


class FakeAssetHierarchy:
    """Simple in-memory asset tree for testing.

    Tree structure:
        root
        ├── child-a
        │   └── grandchild-a1
        └── child-b

    Device mappings:
        dev-1 → [child-a]
        dev-2 → [grandchild-a1]
        dev-3 → [child-b]
        dev-unlinked → []
    """

    _tree = {
        "root": None,
        "child-a": "root",
        "grandchild-a1": "child-a",
        "child-b": "root",
    }
    _devices = {
        "dev-1": ["child-a"],
        "dev-2": ["grandchild-a1"],
        "dev-3": ["child-b"],
    }

    async def get_ancestor_ids(self, asset_id: str) -> list[str]:
        result = []
        current = asset_id
        while current is not None:
            result.append(current)
            current = self._tree.get(current)
        return result

    async def get_descendant_ids(self, asset_id: str) -> list[str]:
        descendants = []
        for aid, parent in self._tree.items():
            if parent == asset_id:
                descendants.append(aid)
                descendants.extend(await self.get_descendant_ids(aid))
        return descendants

    async def get_asset_ids_for_device(self, device_id: str) -> list[str]:
        return self._devices.get(device_id, [])

    async def get_root_asset_ids(self) -> list[str]:
        return [aid for aid, parent in self._tree.items() if parent is None]


# ── Fixtures ──────────────────────────────────────────────────────────


@pytest.fixture
def hierarchy() -> FakeAssetHierarchy:
    return FakeAssetHierarchy()


@pytest.fixture
def service(
    auth_storage: MemoryAuthorizationStorage,
) -> AuthorizationService:
    return AuthorizationService(auth_storage)


@pytest.fixture
def scoped_service(
    auth_storage: MemoryAuthorizationStorage,
    hierarchy: FakeAssetHierarchy,
) -> AuthorizationService:
    return AuthorizationService(auth_storage, asset_hierarchy=hierarchy)


async def _seed_role_and_assign(
    storage: MemoryAuthorizationStorage,
    *,
    role_id: str = "role-1",
    role_name: str = "testrole",
    permissions: list[Permission],
    user_id: str = "user-1",
    asset_id: str = "root",
) -> Role:
    role = Role(
        id=role_id,
        name=role_name,
        permissions=permissions,
    )
    await storage.save_role(role)
    await storage.save_assignment(
        UserRoleAssignment(
            id=f"assign-{role_id}-{user_id}-{asset_id}",
            user_id=user_id,
            role_id=role_id,
            asset_id=asset_id,
        )
    )
    return role


# ── Tests ─────────────────────────────────────────────────────────────


class TestGetUserPermissionsUnscoped:
    @pytest.mark.asyncio
    async def test_no_assignments(self, service: AuthorizationService):
        perms = await service.get_user_permissions("user-1")
        assert perms == set()

    @pytest.mark.asyncio
    async def test_aggregates_all_roles(
        self,
        service: AuthorizationService,
        auth_storage: MemoryAuthorizationStorage,
    ):
        await _seed_role_and_assign(
            auth_storage,
            role_id="r1",
            role_name="role-a",
            permissions=[Permission.DEVICES_READ],
            asset_id="asset-a",
        )
        await _seed_role_and_assign(
            auth_storage,
            role_id="r2",
            role_name="role-b",
            permissions=[Permission.USERS_READ],
            asset_id="asset-b",
        )
        perms = await service.get_user_permissions("user-1")
        assert perms == {Permission.DEVICES_READ, Permission.USERS_READ}


class TestGetUserPermissionsScoped:
    @pytest.mark.asyncio
    async def test_matches_direct_asset(
        self,
        scoped_service: AuthorizationService,
        auth_storage: MemoryAuthorizationStorage,
    ):
        await _seed_role_and_assign(
            auth_storage,
            permissions=[Permission.DEVICES_READ],
            asset_id="child-a",
        )
        perms = await scoped_service.get_user_permissions("user-1", "child-a")
        assert Permission.DEVICES_READ in perms

    @pytest.mark.asyncio
    async def test_inherits_from_ancestor(
        self,
        scoped_service: AuthorizationService,
        auth_storage: MemoryAuthorizationStorage,
    ):
        # Role assigned at root
        await _seed_role_and_assign(
            auth_storage,
            permissions=[Permission.DEVICES_READ],
            asset_id="root",
        )
        # Checking permission at grandchild should bubble up to root
        perms = await scoped_service.get_user_permissions(
            "user-1", "grandchild-a1"
        )
        assert Permission.DEVICES_READ in perms

    @pytest.mark.asyncio
    async def test_no_permission_on_unrelated_asset(
        self,
        scoped_service: AuthorizationService,
        auth_storage: MemoryAuthorizationStorage,
    ):
        await _seed_role_and_assign(
            auth_storage,
            permissions=[Permission.DEVICES_READ],
            asset_id="child-a",
        )
        perms = await scoped_service.get_user_permissions("user-1", "child-b")
        assert perms == set()

    @pytest.mark.asyncio
    async def test_scoped_without_hierarchy(
        self,
        service: AuthorizationService,
        auth_storage: MemoryAuthorizationStorage,
    ):
        # No hierarchy provider — should only match exact asset_id
        await _seed_role_and_assign(
            auth_storage,
            permissions=[Permission.DEVICES_READ],
            asset_id="child-a",
        )
        perms = await service.get_user_permissions("user-1", "child-a")
        assert Permission.DEVICES_READ in perms
        # Grandchild won't match since there's no hierarchy to bubble up
        perms = await service.get_user_permissions("user-1", "grandchild-a1")
        assert perms == set()


class TestCheckPermission:
    @pytest.mark.asyncio
    async def test_has_permission(
        self,
        service: AuthorizationService,
        auth_storage: MemoryAuthorizationStorage,
    ):
        await _seed_role_and_assign(
            auth_storage, permissions=[Permission.DEVICES_READ]
        )
        assert await service.check_permission("user-1", Permission.DEVICES_READ)

    @pytest.mark.asyncio
    async def test_lacks_permission(
        self,
        service: AuthorizationService,
        auth_storage: MemoryAuthorizationStorage,
    ):
        await _seed_role_and_assign(
            auth_storage, permissions=[Permission.DEVICES_READ]
        )
        assert not await service.check_permission("user-1", Permission.USERS_MANAGE)


class TestGetAccessibleAssetIds:
    @pytest.mark.asyncio
    async def test_returns_none_without_hierarchy(
        self,
        service: AuthorizationService,
        auth_storage: MemoryAuthorizationStorage,
    ):
        result = await service.get_accessible_asset_ids(
            "user-1", Permission.DEVICES_READ
        )
        assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_for_root_assignment(
        self,
        scoped_service: AuthorizationService,
        auth_storage: MemoryAuthorizationStorage,
    ):
        await _seed_role_and_assign(
            auth_storage,
            permissions=[Permission.DEVICES_READ],
            asset_id="root",
        )
        result = await scoped_service.get_accessible_asset_ids(
            "user-1", Permission.DEVICES_READ
        )
        assert result is None  # unrestricted

    @pytest.mark.asyncio
    async def test_returns_asset_and_descendants(
        self,
        scoped_service: AuthorizationService,
        auth_storage: MemoryAuthorizationStorage,
    ):
        await _seed_role_and_assign(
            auth_storage,
            permissions=[Permission.DEVICES_READ],
            asset_id="child-a",
        )
        result = await scoped_service.get_accessible_asset_ids(
            "user-1", Permission.DEVICES_READ
        )
        assert result is not None
        assert "child-a" in result
        assert "grandchild-a1" in result
        assert "child-b" not in result

    @pytest.mark.asyncio
    async def test_no_matching_permission(
        self,
        scoped_service: AuthorizationService,
        auth_storage: MemoryAuthorizationStorage,
    ):
        await _seed_role_and_assign(
            auth_storage,
            permissions=[Permission.DEVICES_READ],
            asset_id="child-a",
        )
        result = await scoped_service.get_accessible_asset_ids(
            "user-1", Permission.USERS_MANAGE
        )
        assert result == set()


class TestCheckDevicePermission:
    @pytest.mark.asyncio
    async def test_device_linked_to_permitted_asset(
        self,
        scoped_service: AuthorizationService,
        auth_storage: MemoryAuthorizationStorage,
    ):
        await _seed_role_and_assign(
            auth_storage,
            permissions=[Permission.DEVICES_READ],
            asset_id="child-a",
        )
        # dev-1 is linked to child-a
        assert await scoped_service.check_device_permission(
            "user-1", Permission.DEVICES_READ, "dev-1"
        )

    @pytest.mark.asyncio
    async def test_device_linked_to_descendant(
        self,
        scoped_service: AuthorizationService,
        auth_storage: MemoryAuthorizationStorage,
    ):
        # Role at root covers all descendants
        await _seed_role_and_assign(
            auth_storage,
            permissions=[Permission.DEVICES_READ],
            asset_id="root",
        )
        # dev-2 is linked to grandchild-a1
        assert await scoped_service.check_device_permission(
            "user-1", Permission.DEVICES_READ, "dev-2"
        )

    @pytest.mark.asyncio
    async def test_device_not_linked_to_permitted_asset(
        self,
        scoped_service: AuthorizationService,
        auth_storage: MemoryAuthorizationStorage,
    ):
        await _seed_role_and_assign(
            auth_storage,
            permissions=[Permission.DEVICES_READ],
            asset_id="child-a",
        )
        # dev-3 is linked to child-b — no permission
        assert not await scoped_service.check_device_permission(
            "user-1", Permission.DEVICES_READ, "dev-3"
        )

    @pytest.mark.asyncio
    async def test_unlinked_device_falls_back_to_unscoped(
        self,
        scoped_service: AuthorizationService,
        auth_storage: MemoryAuthorizationStorage,
    ):
        await _seed_role_and_assign(
            auth_storage,
            permissions=[Permission.DEVICES_READ],
            asset_id="child-a",
        )
        # dev-unlinked has no asset mapping — falls back to unscoped check
        assert await scoped_service.check_device_permission(
            "user-1", Permission.DEVICES_READ, "dev-unlinked"
        )

    @pytest.mark.asyncio
    async def test_no_hierarchy_falls_back(
        self,
        service: AuthorizationService,
        auth_storage: MemoryAuthorizationStorage,
    ):
        await _seed_role_and_assign(
            auth_storage, permissions=[Permission.DEVICES_READ]
        )
        # Without hierarchy, check_device_permission falls back to unscoped
        assert await service.check_device_permission(
            "user-1", Permission.DEVICES_READ, "any-device"
        )


class TestFilterDeviceIds:
    @pytest.mark.asyncio
    async def test_unrestricted_returns_all(
        self,
        scoped_service: AuthorizationService,
        auth_storage: MemoryAuthorizationStorage,
    ):
        await _seed_role_and_assign(
            auth_storage,
            permissions=[Permission.DEVICES_READ],
            asset_id="root",
        )
        result = await scoped_service.filter_device_ids(
            "user-1", Permission.DEVICES_READ, ["dev-1", "dev-2", "dev-3"]
        )
        assert result == ["dev-1", "dev-2", "dev-3"]

    @pytest.mark.asyncio
    async def test_filters_to_accessible_assets(
        self,
        scoped_service: AuthorizationService,
        auth_storage: MemoryAuthorizationStorage,
    ):
        await _seed_role_and_assign(
            auth_storage,
            permissions=[Permission.DEVICES_READ],
            asset_id="child-a",
        )
        result = await scoped_service.filter_device_ids(
            "user-1",
            Permission.DEVICES_READ,
            ["dev-1", "dev-2", "dev-3"],
        )
        # dev-1 → child-a (accessible), dev-2 → grandchild-a1 (accessible),
        # dev-3 → child-b (not accessible)
        assert "dev-1" in result
        assert "dev-2" in result
        assert "dev-3" not in result

    @pytest.mark.asyncio
    async def test_unlinked_devices_excluded_from_scoped(
        self,
        scoped_service: AuthorizationService,
        auth_storage: MemoryAuthorizationStorage,
    ):
        await _seed_role_and_assign(
            auth_storage,
            permissions=[Permission.DEVICES_READ],
            asset_id="child-a",
        )
        result = await scoped_service.filter_device_ids(
            "user-1",
            Permission.DEVICES_READ,
            ["dev-unlinked"],
        )
        assert result == []

    @pytest.mark.asyncio
    async def test_no_hierarchy_returns_all(
        self,
        service: AuthorizationService,
        auth_storage: MemoryAuthorizationStorage,
    ):
        result = await service.filter_device_ids(
            "user-1", Permission.DEVICES_READ, ["dev-1", "dev-2"]
        )
        assert result == ["dev-1", "dev-2"]
