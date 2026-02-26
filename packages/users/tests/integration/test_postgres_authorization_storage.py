"""Integration tests for PostgresAuthorizationStorage against a real PostgreSQL database."""

from __future__ import annotations

import os

import asyncpg
import pytest
import pytest_asyncio

from users.authorization_models import Permission, Role, UserRoleAssignment
from users.models import UserInDB
from users.password import hash_password
from users.storage.postgres.postgres_authorization_storage import (
    PostgresAuthorizationStorage,
)
from users.storage.postgres.postgres_users_storage import PostgresUsersStorage

POSTGRES_URL = os.environ.get("POSTGRES_TEST_URL")

pytestmark = [
    pytest.mark.asyncio,
    pytest.mark.integration,
    pytest.mark.skipif(POSTGRES_URL is None, reason="POSTGRES_TEST_URL not set"),
]


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def pool():
    p = await asyncpg.create_pool(POSTGRES_URL)
    yield p
    await p.close()


@pytest_asyncio.fixture
async def storage(pool: asyncpg.Pool):
    # Users storage needed for FK on user_role_assignments.user_id
    users_store = PostgresUsersStorage(pool)
    await users_store.ensure_schema()

    auth_store = PostgresAuthorizationStorage(pool)
    await auth_store.ensure_schema()

    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM user_role_assignments")
        await conn.execute("DELETE FROM role_permissions")
        await conn.execute("DELETE FROM roles")
        await conn.execute("DELETE FROM users")

    yield auth_store, users_store


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _seed_user(
    users_store: PostgresUsersStorage,
    user_id: str = "user-1",
    username: str = "alice",
) -> UserInDB:
    user = UserInDB(
        id=user_id,
        username=username,
        hashed_password=hash_password("password"),
    )
    await users_store.save(user)
    return user


def _make_role(
    role_id: str = "role-1",
    *,
    name: str = "testrole",
    description: str = "",
    is_system: bool = False,
    permissions: list[Permission] | None = None,
) -> Role:
    return Role(
        id=role_id,
        name=name,
        description=description,
        is_system=is_system,
        permissions=permissions or [],
    )


# ===================================================================
# Role CRUD
# ===================================================================


class TestRoleCRUD:
    async def test_save_and_get_by_id(self, storage):
        auth_store, _ = storage
        role = _make_role(permissions=[Permission.DEVICES_READ, Permission.USERS_MANAGE])
        await auth_store.save_role(role)

        fetched = await auth_store.get_role_by_id("role-1")
        assert fetched is not None
        assert fetched.name == "testrole"
        assert set(fetched.permissions) == {
            Permission.DEVICES_READ,
            Permission.USERS_MANAGE,
        }

    async def test_get_by_id_not_found(self, storage):
        auth_store, _ = storage
        assert await auth_store.get_role_by_id("nonexistent") is None

    async def test_get_by_name(self, storage):
        auth_store, _ = storage
        await auth_store.save_role(_make_role(name="findme"))

        fetched = await auth_store.get_role_by_name("findme")
        assert fetched is not None
        assert fetched.id == "role-1"

    async def test_get_by_name_not_found(self, storage):
        auth_store, _ = storage
        assert await auth_store.get_role_by_name("nope") is None

    async def test_list_roles(self, storage):
        auth_store, _ = storage
        await auth_store.save_role(_make_role("r1", name="alpha"))
        await auth_store.save_role(_make_role("r2", name="beta"))

        roles = await auth_store.list_roles()
        assert len(roles) == 2
        # Ordered by name
        assert roles[0].name == "alpha"
        assert roles[1].name == "beta"

    async def test_list_roles_empty(self, storage):
        auth_store, _ = storage
        assert await auth_store.list_roles() == []

    async def test_save_role_upsert_updates_permissions(self, storage):
        auth_store, _ = storage
        role = _make_role(permissions=[Permission.DEVICES_READ])
        await auth_store.save_role(role)

        updated = role.model_copy(
            update={"permissions": [Permission.USERS_READ, Permission.USERS_MANAGE]}
        )
        await auth_store.save_role(updated)

        fetched = await auth_store.get_role_by_id("role-1")
        assert fetched is not None
        assert set(fetched.permissions) == {
            Permission.USERS_READ,
            Permission.USERS_MANAGE,
        }

    async def test_save_role_upsert_clears_permissions(self, storage):
        auth_store, _ = storage
        role = _make_role(permissions=[Permission.DEVICES_READ])
        await auth_store.save_role(role)

        cleared = role.model_copy(update={"permissions": []})
        await auth_store.save_role(cleared)

        fetched = await auth_store.get_role_by_id("role-1")
        assert fetched is not None
        assert fetched.permissions == []

    async def test_delete_role(self, storage):
        auth_store, _ = storage
        await auth_store.save_role(_make_role())
        await auth_store.delete_role("role-1")

        assert await auth_store.get_role_by_id("role-1") is None

    async def test_delete_role_cascades_permissions(self, storage, pool):
        auth_store, _ = storage
        await auth_store.save_role(
            _make_role(permissions=[Permission.DEVICES_READ])
        )
        await auth_store.delete_role("role-1")

        async with pool.acquire() as conn:
            count = await conn.fetchval(
                "SELECT count(*) FROM role_permissions WHERE role_id = $1",
                "role-1",
            )
        assert count == 0

    async def test_delete_role_cascades_assignments(self, storage):
        auth_store, users_store = storage
        await _seed_user(users_store)
        role = _make_role()
        await auth_store.save_role(role)
        await auth_store.save_assignment(
            UserRoleAssignment(
                id="a1", user_id="user-1", role_id="role-1", asset_id="asset-1"
            )
        )

        await auth_store.delete_role("role-1")

        assert await auth_store.get_assignment_by_id("a1") is None

    async def test_unknown_permissions_skipped(self, storage, pool):
        """Permissions not in the enum should be silently skipped (forward compat)."""
        auth_store, _ = storage
        role = _make_role(permissions=[Permission.DEVICES_READ])
        await auth_store.save_role(role)

        # Insert an unknown permission directly
        async with pool.acquire() as conn:
            await conn.execute(
                "INSERT INTO role_permissions (role_id, permission) VALUES ($1, $2)",
                "role-1",
                "future:unknown",
            )

        fetched = await auth_store.get_role_by_id("role-1")
        assert fetched is not None
        assert fetched.permissions == [Permission.DEVICES_READ]


# ===================================================================
# Role constraints
# ===================================================================


class TestRoleConstraints:
    async def test_unique_role_name(self, storage):
        auth_store, _ = storage
        await auth_store.save_role(_make_role("r1", name="unique"))
        with pytest.raises(asyncpg.UniqueViolationError):
            await auth_store.save_role(_make_role("r2", name="unique"))


# ===================================================================
# Assignment CRUD
# ===================================================================


class TestAssignmentCRUD:
    async def test_save_and_get_by_id(self, storage):
        auth_store, users_store = storage
        await _seed_user(users_store)
        await auth_store.save_role(_make_role())

        assignment = UserRoleAssignment(
            id="a1", user_id="user-1", role_id="role-1", asset_id="asset-1"
        )
        await auth_store.save_assignment(assignment)

        fetched = await auth_store.get_assignment_by_id("a1")
        assert fetched is not None
        assert fetched.user_id == "user-1"
        assert fetched.role_id == "role-1"
        assert fetched.asset_id == "asset-1"

    async def test_get_by_id_not_found(self, storage):
        auth_store, _ = storage
        assert await auth_store.get_assignment_by_id("nope") is None

    async def test_list_assignments_for_user(self, storage):
        auth_store, users_store = storage
        await _seed_user(users_store, "u1", "alice")
        await _seed_user(users_store, "u2", "bob")
        await auth_store.save_role(_make_role())

        await auth_store.save_assignment(
            UserRoleAssignment(id="a1", user_id="u1", role_id="role-1", asset_id="x")
        )
        await auth_store.save_assignment(
            UserRoleAssignment(id="a2", user_id="u2", role_id="role-1", asset_id="x")
        )

        result = await auth_store.list_assignments_for_user("u1")
        assert len(result) == 1
        assert result[0].user_id == "u1"

    async def test_list_assignments_for_role(self, storage):
        auth_store, users_store = storage
        await _seed_user(users_store)
        await auth_store.save_role(_make_role("r1", name="role-a"))
        await auth_store.save_role(_make_role("r2", name="role-b"))

        await auth_store.save_assignment(
            UserRoleAssignment(id="a1", user_id="user-1", role_id="r1", asset_id="x")
        )
        await auth_store.save_assignment(
            UserRoleAssignment(id="a2", user_id="user-1", role_id="r2", asset_id="x")
        )

        result = await auth_store.list_assignments_for_role("r1")
        assert len(result) == 1
        assert result[0].role_id == "r1"

    async def test_list_all_assignments(self, storage):
        auth_store, users_store = storage
        await _seed_user(users_store, "u1", "alice")
        await _seed_user(users_store, "u2", "bob")
        await auth_store.save_role(_make_role())

        await auth_store.save_assignment(
            UserRoleAssignment(id="a1", user_id="u1", role_id="role-1", asset_id="x")
        )
        await auth_store.save_assignment(
            UserRoleAssignment(id="a2", user_id="u2", role_id="role-1", asset_id="x")
        )

        result = await auth_store.list_all_assignments()
        assert len(result) == 2

    async def test_save_assignment_upsert(self, storage):
        auth_store, users_store = storage
        await _seed_user(users_store)
        await auth_store.save_role(_make_role())

        assignment = UserRoleAssignment(
            id="a1", user_id="user-1", role_id="role-1", asset_id="old"
        )
        await auth_store.save_assignment(assignment)

        updated = assignment.model_copy(update={"asset_id": "new"})
        await auth_store.save_assignment(updated)

        fetched = await auth_store.get_assignment_by_id("a1")
        assert fetched is not None
        assert fetched.asset_id == "new"

    async def test_delete_assignment(self, storage):
        auth_store, users_store = storage
        await _seed_user(users_store)
        await auth_store.save_role(_make_role())
        await auth_store.save_assignment(
            UserRoleAssignment(
                id="a1", user_id="user-1", role_id="role-1", asset_id="x"
            )
        )

        await auth_store.delete_assignment("a1")
        assert await auth_store.get_assignment_by_id("a1") is None

    async def test_delete_nonexistent_is_noop(self, storage):
        auth_store, _ = storage
        await auth_store.delete_assignment("nope")

    async def test_delete_assignments_for_user(self, storage):
        auth_store, users_store = storage
        await _seed_user(users_store, "u1", "alice")
        await _seed_user(users_store, "u2", "bob")
        await auth_store.save_role(_make_role())

        await auth_store.save_assignment(
            UserRoleAssignment(id="a1", user_id="u1", role_id="role-1", asset_id="x")
        )
        await auth_store.save_assignment(
            UserRoleAssignment(id="a2", user_id="u1", role_id="role-1", asset_id="y")
        )
        await auth_store.save_assignment(
            UserRoleAssignment(id="a3", user_id="u2", role_id="role-1", asset_id="x")
        )

        await auth_store.delete_assignments_for_user("u1")

        remaining = await auth_store.list_all_assignments()
        assert len(remaining) == 1
        assert remaining[0].user_id == "u2"


# ===================================================================
# Null asset migration
# ===================================================================


class TestNullAssetMigration:
    async def test_update_null_asset_ids(self, storage, pool):
        auth_store, users_store = storage
        await _seed_user(users_store)
        await auth_store.save_role(_make_role())

        # Insert assignment with NULL asset_id directly
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO user_role_assignments (id, user_id, role_id, asset_id)
                VALUES ($1, $2, $3, $4)
                """,
                "a1",
                "user-1",
                "role-1",
                None,
            )

        await auth_store.update_null_asset_ids("root-asset")

        fetched = await auth_store.get_assignment_by_id("a1")
        assert fetched is not None
        assert fetched.asset_id == "root-asset"

    async def test_does_not_touch_existing_asset_ids(self, storage, pool):
        auth_store, users_store = storage
        await _seed_user(users_store)
        await auth_store.save_role(_make_role())

        await auth_store.save_assignment(
            UserRoleAssignment(
                id="a1", user_id="user-1", role_id="role-1", asset_id="keep-me"
            )
        )

        await auth_store.update_null_asset_ids("root-asset")

        fetched = await auth_store.get_assignment_by_id("a1")
        assert fetched is not None
        assert fetched.asset_id == "keep-me"


# ===================================================================
# FK cascades
# ===================================================================


class TestForeignKeyCascades:
    async def test_deleting_user_cascades_assignments(self, storage):
        auth_store, users_store = storage
        await _seed_user(users_store)
        await auth_store.save_role(_make_role())
        await auth_store.save_assignment(
            UserRoleAssignment(
                id="a1", user_id="user-1", role_id="role-1", asset_id="x"
            )
        )

        await users_store.delete("user-1")

        assert await auth_store.get_assignment_by_id("a1") is None

    async def test_deleting_role_cascades_assignments(self, storage):
        auth_store, users_store = storage
        await _seed_user(users_store)
        await auth_store.save_role(_make_role())
        await auth_store.save_assignment(
            UserRoleAssignment(
                id="a1", user_id="user-1", role_id="role-1", asset_id="x"
            )
        )

        await auth_store.delete_role("role-1")

        assert await auth_store.get_assignment_by_id("a1") is None
