"""Tests for users.roles_manager.RolesManager."""

import pytest

from models.errors import NotFoundError

from users.authorization_models import (
    Permission,
    Role,
    RoleCreate,
    RoleUpdate,
    UserRoleAssignment,
    UserRoleAssignmentCreate,
)
from users.roles_manager import RolesManager

from conftest import MemoryAuthorizationStorage


@pytest.fixture
def roles_manager(auth_storage: MemoryAuthorizationStorage) -> RolesManager:
    return RolesManager(auth_storage)


class TestEnsureDefaultRoles:
    @pytest.mark.asyncio
    async def test_creates_three_system_roles(
        self, roles_manager: RolesManager, auth_storage: MemoryAuthorizationStorage
    ):
        await roles_manager.ensure_default_roles()
        roles = await auth_storage.list_roles()
        assert len(roles) == 3
        names = {r.name for r in roles}
        assert names == {"admin", "operator", "viewer"}
        assert all(r.is_system for r in roles)

    @pytest.mark.asyncio
    async def test_admin_has_all_permissions(
        self, roles_manager: RolesManager, auth_storage: MemoryAuthorizationStorage
    ):
        await roles_manager.ensure_default_roles()
        admin = await auth_storage.get_role_by_name("admin")
        assert admin is not None
        assert set(admin.permissions) == set(Permission)

    @pytest.mark.asyncio
    async def test_updates_permissions_on_rerun(
        self, roles_manager: RolesManager, auth_storage: MemoryAuthorizationStorage
    ):
        # First run: create roles
        await roles_manager.ensure_default_roles()
        admin = await auth_storage.get_role_by_name("admin")
        # Modify permissions
        modified = admin.model_copy(update={"permissions": [Permission.DEVICES_READ]})
        await auth_storage.save_role(modified)
        # Second run: should restore full permissions
        await roles_manager.ensure_default_roles()
        admin = await auth_storage.get_role_by_name("admin")
        assert set(admin.permissions) == set(Permission)

    @pytest.mark.asyncio
    async def test_idempotent_does_not_duplicate(
        self, roles_manager: RolesManager, auth_storage: MemoryAuthorizationStorage
    ):
        await roles_manager.ensure_default_roles()
        await roles_manager.ensure_default_roles()
        roles = await auth_storage.list_roles()
        assert len(roles) == 3


class TestEnsureDefaultRoleAssignments:
    @pytest.mark.asyncio
    async def test_admin_gets_admin_role(
        self, roles_manager: RolesManager, auth_storage: MemoryAuthorizationStorage
    ):
        await roles_manager.ensure_default_roles()
        admin_role = await auth_storage.get_role_by_name("admin")
        await roles_manager.ensure_default_role_assignments(
            ["user-admin", "user-viewer"],
            "root-asset",
            admin_user_id="user-admin",
        )
        assignments = await auth_storage.list_assignments_for_user("user-admin")
        assert len(assignments) == 1
        assert assignments[0].role_id == admin_role.id
        assert assignments[0].asset_id == "root-asset"

    @pytest.mark.asyncio
    async def test_other_users_get_viewer_role(
        self, roles_manager: RolesManager, auth_storage: MemoryAuthorizationStorage
    ):
        await roles_manager.ensure_default_roles()
        viewer_role = await auth_storage.get_role_by_name("viewer")
        await roles_manager.ensure_default_role_assignments(
            ["user-admin", "user-other"],
            "root-asset",
            admin_user_id="user-admin",
        )
        assignments = await auth_storage.list_assignments_for_user("user-other")
        assert len(assignments) == 1
        assert assignments[0].role_id == viewer_role.id

    @pytest.mark.asyncio
    async def test_skips_users_with_existing_assignments(
        self, roles_manager: RolesManager, auth_storage: MemoryAuthorizationStorage
    ):
        await roles_manager.ensure_default_roles()
        # Pre-assign a role
        await auth_storage.save_assignment(
            UserRoleAssignment(
                id="existing", user_id="user-1", role_id="some-role", asset_id="x"
            )
        )
        await roles_manager.ensure_default_role_assignments(
            ["user-1"], "root-asset"
        )
        assignments = await auth_storage.list_assignments_for_user("user-1")
        assert len(assignments) == 1
        assert assignments[0].id == "existing"

    @pytest.mark.asyncio
    async def test_noop_when_roles_missing(
        self, roles_manager: RolesManager, auth_storage: MemoryAuthorizationStorage
    ):
        # Don't seed roles — method should return early
        await roles_manager.ensure_default_role_assignments(["u1"], "root")
        assignments = await auth_storage.list_all_assignments()
        assert assignments == []


class TestRoleCRUD:
    @pytest.mark.asyncio
    async def test_list_roles(
        self, roles_manager: RolesManager, auth_storage: MemoryAuthorizationStorage
    ):
        await roles_manager.ensure_default_roles()
        roles = await roles_manager.list_roles()
        assert len(roles) == 3

    @pytest.mark.asyncio
    async def test_get_role(
        self, roles_manager: RolesManager, auth_storage: MemoryAuthorizationStorage
    ):
        await roles_manager.ensure_default_roles()
        admin = await auth_storage.get_role_by_name("admin")
        result = await roles_manager.get_role(admin.id)
        assert result.name == "admin"

    @pytest.mark.asyncio
    async def test_get_role_not_found(self, roles_manager: RolesManager):
        with pytest.raises(NotFoundError):
            await roles_manager.get_role("nonexistent")

    @pytest.mark.asyncio
    async def test_create_role(self, roles_manager: RolesManager):
        role = await roles_manager.create_role(
            RoleCreate(
                name="custom",
                description="Custom role",
                permissions=[Permission.DEVICES_READ],
            )
        )
        assert role.name == "custom"
        assert role.is_system is False
        assert role.permissions == [Permission.DEVICES_READ]

    @pytest.mark.asyncio
    async def test_create_duplicate_name_raises(self, roles_manager: RolesManager):
        await roles_manager.create_role(RoleCreate(name="unique"))
        with pytest.raises(ValueError, match="already exists"):
            await roles_manager.create_role(RoleCreate(name="unique"))

    @pytest.mark.asyncio
    async def test_update_role(self, roles_manager: RolesManager):
        role = await roles_manager.create_role(RoleCreate(name="updatable"))
        updated = await roles_manager.update_role(
            role.id,
            RoleUpdate(
                name="renamed",
                description="Updated",
                permissions=[Permission.USERS_READ],
            ),
        )
        assert updated.name == "renamed"
        assert updated.description == "Updated"
        assert updated.permissions == [Permission.USERS_READ]

    @pytest.mark.asyncio
    async def test_update_system_role_raises(
        self, roles_manager: RolesManager, auth_storage: MemoryAuthorizationStorage
    ):
        await roles_manager.ensure_default_roles()
        admin = await auth_storage.get_role_by_name("admin")
        with pytest.raises(ValueError, match="system role"):
            await roles_manager.update_role(admin.id, RoleUpdate(name="hacked"))

    @pytest.mark.asyncio
    async def test_update_duplicate_name_raises(self, roles_manager: RolesManager):
        await roles_manager.create_role(RoleCreate(name="role-a"))
        role_b = await roles_manager.create_role(RoleCreate(name="role-b"))
        with pytest.raises(ValueError, match="already exists"):
            await roles_manager.update_role(role_b.id, RoleUpdate(name="role-a"))

    @pytest.mark.asyncio
    async def test_update_same_name_allowed(self, roles_manager: RolesManager):
        role = await roles_manager.create_role(RoleCreate(name="keepname"))
        updated = await roles_manager.update_role(
            role.id, RoleUpdate(name="keepname", description="new desc")
        )
        assert updated.name == "keepname"
        assert updated.description == "new desc"

    @pytest.mark.asyncio
    async def test_delete_role(
        self, roles_manager: RolesManager, auth_storage: MemoryAuthorizationStorage
    ):
        role = await roles_manager.create_role(RoleCreate(name="deleteme"))
        await roles_manager.delete_role(role.id)
        with pytest.raises(NotFoundError):
            await roles_manager.get_role(role.id)

    @pytest.mark.asyncio
    async def test_delete_system_role_raises(
        self, roles_manager: RolesManager, auth_storage: MemoryAuthorizationStorage
    ):
        await roles_manager.ensure_default_roles()
        admin = await auth_storage.get_role_by_name("admin")
        with pytest.raises(ValueError, match="system role"):
            await roles_manager.delete_role(admin.id)

    @pytest.mark.asyncio
    async def test_delete_nonexistent_raises(self, roles_manager: RolesManager):
        with pytest.raises(NotFoundError):
            await roles_manager.delete_role("nope")


class TestAssignmentCRUD:
    @pytest.mark.asyncio
    async def test_create_assignment(
        self, roles_manager: RolesManager, auth_storage: MemoryAuthorizationStorage
    ):
        role = await roles_manager.create_role(RoleCreate(name="testrole"))
        assignment = await roles_manager.create_assignment(
            UserRoleAssignmentCreate(
                user_id="u1", role_id=role.id, asset_id="asset-1"
            )
        )
        assert assignment.user_id == "u1"
        assert assignment.role_id == role.id
        assert assignment.asset_id == "asset-1"

    @pytest.mark.asyncio
    async def test_create_assignment_nonexistent_role_raises(
        self, roles_manager: RolesManager
    ):
        with pytest.raises(NotFoundError):
            await roles_manager.create_assignment(
                UserRoleAssignmentCreate(
                    user_id="u1", role_id="nonexistent", asset_id="a"
                )
            )

    @pytest.mark.asyncio
    async def test_list_assignments_by_user(
        self, roles_manager: RolesManager, auth_storage: MemoryAuthorizationStorage
    ):
        role = await roles_manager.create_role(RoleCreate(name="r"))
        await roles_manager.create_assignment(
            UserRoleAssignmentCreate(user_id="u1", role_id=role.id, asset_id="a")
        )
        await roles_manager.create_assignment(
            UserRoleAssignmentCreate(user_id="u2", role_id=role.id, asset_id="a")
        )
        result = await roles_manager.list_assignments(user_id="u1")
        assert len(result) == 1
        assert result[0].user_id == "u1"

    @pytest.mark.asyncio
    async def test_list_assignments_by_role(
        self, roles_manager: RolesManager, auth_storage: MemoryAuthorizationStorage
    ):
        r1 = await roles_manager.create_role(RoleCreate(name="r1"))
        r2 = await roles_manager.create_role(RoleCreate(name="r2"))
        await roles_manager.create_assignment(
            UserRoleAssignmentCreate(user_id="u1", role_id=r1.id, asset_id="a")
        )
        await roles_manager.create_assignment(
            UserRoleAssignmentCreate(user_id="u1", role_id=r2.id, asset_id="a")
        )
        result = await roles_manager.list_assignments(role_id=r1.id)
        assert len(result) == 1

    @pytest.mark.asyncio
    async def test_list_all_assignments(
        self, roles_manager: RolesManager, auth_storage: MemoryAuthorizationStorage
    ):
        role = await roles_manager.create_role(RoleCreate(name="r"))
        await roles_manager.create_assignment(
            UserRoleAssignmentCreate(user_id="u1", role_id=role.id, asset_id="a")
        )
        await roles_manager.create_assignment(
            UserRoleAssignmentCreate(user_id="u2", role_id=role.id, asset_id="a")
        )
        result = await roles_manager.list_assignments()
        assert len(result) == 2

    @pytest.mark.asyncio
    async def test_delete_assignment(
        self, roles_manager: RolesManager, auth_storage: MemoryAuthorizationStorage
    ):
        role = await roles_manager.create_role(RoleCreate(name="r"))
        assignment = await roles_manager.create_assignment(
            UserRoleAssignmentCreate(user_id="u1", role_id=role.id, asset_id="a")
        )
        await roles_manager.delete_assignment(assignment.id)
        result = await roles_manager.list_assignments()
        assert result == []

    @pytest.mark.asyncio
    async def test_delete_nonexistent_assignment_raises(
        self, roles_manager: RolesManager
    ):
        with pytest.raises(NotFoundError):
            await roles_manager.delete_assignment("nope")


class TestMigrateNullAssetAssignments:
    @pytest.mark.asyncio
    async def test_delegates_to_storage(
        self, roles_manager: RolesManager, auth_storage: MemoryAuthorizationStorage
    ):
        # Save assignment with empty asset_id to simulate null
        await auth_storage.save_assignment(
            UserRoleAssignment(id="a1", user_id="u1", role_id="r1", asset_id="")
        )
        await roles_manager.migrate_null_asset_assignments("root-asset")
        assignment = await auth_storage.get_assignment_by_id("a1")
        assert assignment.asset_id == "root-asset"
