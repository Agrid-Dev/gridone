"""Tests for YAML storage backends."""

import pytest

from users.authorization_models import Permission, Role, UserRoleAssignment
from users.models import UserInDB
from users.storage.yaml.yaml_users_storage import YamlUsersStorage
from users.storage.yaml.yaml_authorization_storage import YamlAuthorizationStorage


# ── YamlUsersStorage ──────────────────────────────────────────────────


@pytest.fixture
def yaml_users(tmp_path) -> YamlUsersStorage:
    return YamlUsersStorage(tmp_path / "users")


class TestYamlUsersStorage:
    @pytest.mark.asyncio
    async def test_save_and_get_by_id(self, yaml_users: YamlUsersStorage):
        user = UserInDB(id="u1", username="alice", hashed_password="hash")
        await yaml_users.save(user)
        result = await yaml_users.get_by_id("u1")
        assert result is not None
        assert result.username == "alice"

    @pytest.mark.asyncio
    async def test_get_by_id_not_found(self, yaml_users: YamlUsersStorage):
        result = await yaml_users.get_by_id("nonexistent")
        assert result is None

    @pytest.mark.asyncio
    async def test_get_by_username(self, yaml_users: YamlUsersStorage):
        user = UserInDB(id="u1", username="alice", hashed_password="hash")
        await yaml_users.save(user)
        result = await yaml_users.get_by_username("alice")
        assert result is not None
        assert result.id == "u1"

    @pytest.mark.asyncio
    async def test_get_by_username_not_found(self, yaml_users: YamlUsersStorage):
        result = await yaml_users.get_by_username("nobody")
        assert result is None

    @pytest.mark.asyncio
    async def test_list_all(self, yaml_users: YamlUsersStorage):
        await yaml_users.save(
            UserInDB(id="u1", username="a", hashed_password="h1")
        )
        await yaml_users.save(
            UserInDB(id="u2", username="b", hashed_password="h2")
        )
        users = await yaml_users.list_all()
        assert len(users) == 2

    @pytest.mark.asyncio
    async def test_list_all_empty(self, yaml_users: YamlUsersStorage):
        users = await yaml_users.list_all()
        assert users == []

    @pytest.mark.asyncio
    async def test_save_overwrites(self, yaml_users: YamlUsersStorage):
        user = UserInDB(id="u1", username="old", hashed_password="hash")
        await yaml_users.save(user)
        updated = UserInDB(id="u1", username="new", hashed_password="hash")
        await yaml_users.save(updated)
        result = await yaml_users.get_by_id("u1")
        assert result.username == "new"

    @pytest.mark.asyncio
    async def test_delete(self, yaml_users: YamlUsersStorage):
        await yaml_users.save(
            UserInDB(id="u1", username="alice", hashed_password="hash")
        )
        await yaml_users.delete("u1")
        assert await yaml_users.get_by_id("u1") is None

    @pytest.mark.asyncio
    async def test_delete_nonexistent_noop(self, yaml_users: YamlUsersStorage):
        await yaml_users.delete("nonexistent")  # should not raise

    @pytest.mark.asyncio
    async def test_preserves_all_fields(self, yaml_users: YamlUsersStorage):
        user = UserInDB(
            id="u1",
            username="alice",
            hashed_password="hash",
            name="Alice",
            email="alice@example.com",
            title="Engineer",
            must_change_password=True,
        )
        await yaml_users.save(user)
        result = await yaml_users.get_by_id("u1")
        assert result.name == "Alice"
        assert result.email == "alice@example.com"
        assert result.title == "Engineer"
        assert result.must_change_password is True


# ── YamlAuthorizationStorage ─────────────────────────────────────────


@pytest.fixture
def yaml_auth(tmp_path) -> YamlAuthorizationStorage:
    return YamlAuthorizationStorage(tmp_path / "auth")


class TestYamlAuthorizationStorageRoles:
    @pytest.mark.asyncio
    async def test_save_and_get_role(self, yaml_auth: YamlAuthorizationStorage):
        role = Role(
            id="r1",
            name="admin",
            description="Full access",
            is_system=True,
            permissions=[Permission.DEVICES_READ, Permission.USERS_MANAGE],
        )
        await yaml_auth.save_role(role)
        result = await yaml_auth.get_role_by_id("r1")
        assert result is not None
        assert result.name == "admin"
        assert set(result.permissions) == {
            Permission.DEVICES_READ,
            Permission.USERS_MANAGE,
        }

    @pytest.mark.asyncio
    async def test_get_role_not_found(self, yaml_auth: YamlAuthorizationStorage):
        result = await yaml_auth.get_role_by_id("nope")
        assert result is None

    @pytest.mark.asyncio
    async def test_get_role_by_name(self, yaml_auth: YamlAuthorizationStorage):
        role = Role(id="r1", name="viewer", permissions=[Permission.DEVICES_READ])
        await yaml_auth.save_role(role)
        result = await yaml_auth.get_role_by_name("viewer")
        assert result is not None
        assert result.id == "r1"

    @pytest.mark.asyncio
    async def test_get_role_by_name_not_found(
        self, yaml_auth: YamlAuthorizationStorage
    ):
        result = await yaml_auth.get_role_by_name("nope")
        assert result is None

    @pytest.mark.asyncio
    async def test_list_roles(self, yaml_auth: YamlAuthorizationStorage):
        await yaml_auth.save_role(Role(id="r1", name="a"))
        await yaml_auth.save_role(Role(id="r2", name="b"))
        roles = await yaml_auth.list_roles()
        assert len(roles) == 2

    @pytest.mark.asyncio
    async def test_delete_role_cascades_assignments(
        self, yaml_auth: YamlAuthorizationStorage
    ):
        await yaml_auth.save_role(Role(id="r1", name="doomed"))
        await yaml_auth.save_assignment(
            UserRoleAssignment(id="a1", user_id="u1", role_id="r1", asset_id="x")
        )
        await yaml_auth.save_assignment(
            UserRoleAssignment(id="a2", user_id="u2", role_id="r1", asset_id="x")
        )
        # Also save an assignment for a different role to verify it's kept
        await yaml_auth.save_assignment(
            UserRoleAssignment(id="a3", user_id="u1", role_id="r-other", asset_id="x")
        )
        await yaml_auth.delete_role("r1")
        assert await yaml_auth.get_role_by_id("r1") is None
        all_assignments = await yaml_auth.list_all_assignments()
        assert len(all_assignments) == 1
        assert all_assignments[0].id == "a3"

    @pytest.mark.asyncio
    async def test_unknown_permissions_skipped(
        self, yaml_auth: YamlAuthorizationStorage, tmp_path
    ):
        """Permissions not in the enum should be silently skipped (forward compat)."""
        import yaml

        role_path = tmp_path / "auth" / "roles" / "r1.yaml"
        role_path.parent.mkdir(parents=True, exist_ok=True)
        data = {
            "id": "r1",
            "name": "test",
            "description": "",
            "is_system": False,
            "permissions": ["devices:read", "future:unknown:perm"],
        }
        with role_path.open("w") as f:
            yaml.dump(data, f)
        result = await yaml_auth.get_role_by_id("r1")
        assert result is not None
        assert result.permissions == [Permission.DEVICES_READ]


class TestYamlAuthorizationStorageAssignments:
    @pytest.mark.asyncio
    async def test_save_and_get(self, yaml_auth: YamlAuthorizationStorage):
        a = UserRoleAssignment(
            id="a1", user_id="u1", role_id="r1", asset_id="asset-1"
        )
        await yaml_auth.save_assignment(a)
        result = await yaml_auth.get_assignment_by_id("a1")
        assert result is not None
        assert result.user_id == "u1"
        assert result.asset_id == "asset-1"

    @pytest.mark.asyncio
    async def test_get_not_found(self, yaml_auth: YamlAuthorizationStorage):
        result = await yaml_auth.get_assignment_by_id("nope")
        assert result is None

    @pytest.mark.asyncio
    async def test_list_for_user(self, yaml_auth: YamlAuthorizationStorage):
        await yaml_auth.save_assignment(
            UserRoleAssignment(id="a1", user_id="u1", role_id="r1", asset_id="x")
        )
        await yaml_auth.save_assignment(
            UserRoleAssignment(id="a2", user_id="u2", role_id="r1", asset_id="x")
        )
        result = await yaml_auth.list_assignments_for_user("u1")
        assert len(result) == 1
        assert result[0].user_id == "u1"

    @pytest.mark.asyncio
    async def test_list_for_role(self, yaml_auth: YamlAuthorizationStorage):
        await yaml_auth.save_assignment(
            UserRoleAssignment(id="a1", user_id="u1", role_id="r1", asset_id="x")
        )
        await yaml_auth.save_assignment(
            UserRoleAssignment(id="a2", user_id="u1", role_id="r2", asset_id="x")
        )
        result = await yaml_auth.list_assignments_for_role("r1")
        assert len(result) == 1

    @pytest.mark.asyncio
    async def test_list_all(self, yaml_auth: YamlAuthorizationStorage):
        await yaml_auth.save_assignment(
            UserRoleAssignment(id="a1", user_id="u1", role_id="r1", asset_id="x")
        )
        await yaml_auth.save_assignment(
            UserRoleAssignment(id="a2", user_id="u2", role_id="r2", asset_id="x")
        )
        result = await yaml_auth.list_all_assignments()
        assert len(result) == 2

    @pytest.mark.asyncio
    async def test_delete_assignment(self, yaml_auth: YamlAuthorizationStorage):
        await yaml_auth.save_assignment(
            UserRoleAssignment(id="a1", user_id="u1", role_id="r1", asset_id="x")
        )
        await yaml_auth.delete_assignment("a1")
        assert await yaml_auth.get_assignment_by_id("a1") is None

    @pytest.mark.asyncio
    async def test_delete_nonexistent_noop(
        self, yaml_auth: YamlAuthorizationStorage
    ):
        await yaml_auth.delete_assignment("nope")  # should not raise

    @pytest.mark.asyncio
    async def test_delete_assignments_for_user(
        self, yaml_auth: YamlAuthorizationStorage
    ):
        await yaml_auth.save_assignment(
            UserRoleAssignment(id="a1", user_id="u1", role_id="r1", asset_id="x")
        )
        await yaml_auth.save_assignment(
            UserRoleAssignment(id="a2", user_id="u1", role_id="r2", asset_id="x")
        )
        await yaml_auth.save_assignment(
            UserRoleAssignment(id="a3", user_id="u2", role_id="r1", asset_id="x")
        )
        await yaml_auth.delete_assignments_for_user("u1")
        remaining = await yaml_auth.list_all_assignments()
        assert len(remaining) == 1
        assert remaining[0].user_id == "u2"

    @pytest.mark.asyncio
    async def test_update_null_asset_ids(
        self, yaml_auth: YamlAuthorizationStorage, tmp_path
    ):
        """Assignments with null asset_id should be updated to root."""
        import yaml

        assignments_path = tmp_path / "auth" / "role_assignments"
        assignments_path.mkdir(parents=True, exist_ok=True)
        data = {
            "id": "a1",
            "user_id": "u1",
            "role_id": "r1",
            "asset_id": None,
        }
        with (assignments_path / "a1.yaml").open("w") as f:
            yaml.dump(data, f)
        await yaml_auth.update_null_asset_ids("root-asset")
        result = await yaml_auth.get_assignment_by_id("a1")
        assert result is not None
        assert result.asset_id == "root-asset"
