"""Shared fixtures and in-memory mock storage backends for users tests."""

from __future__ import annotations

import pytest

from users.authorization_models import Permission, Role, UserRoleAssignment
from users.models import UserInDB


# ── In-memory users storage ────────────────────────────────────────────


class MemoryUsersStorage:
    """In-memory implementation of UsersStorageBackend for testing."""

    def __init__(self) -> None:
        self._users: dict[str, UserInDB] = {}

    async def get_by_id(self, user_id: str) -> UserInDB | None:
        return self._users.get(user_id)

    async def get_by_username(self, username: str) -> UserInDB | None:
        for u in self._users.values():
            if u.username == username:
                return u
        return None

    async def list_all(self) -> list[UserInDB]:
        return list(self._users.values())

    async def save(self, user: UserInDB) -> None:
        self._users[user.id] = user

    async def delete(self, user_id: str) -> None:
        self._users.pop(user_id, None)


# ── In-memory authorization storage ───────────────────────────────────


class MemoryAuthorizationStorage:
    """In-memory implementation of AuthorizationStorageBackend for testing."""

    def __init__(self) -> None:
        self._roles: dict[str, Role] = {}
        self._assignments: dict[str, UserRoleAssignment] = {}

    # Roles

    async def get_role_by_id(self, role_id: str) -> Role | None:
        return self._roles.get(role_id)

    async def get_role_by_name(self, name: str) -> Role | None:
        for r in self._roles.values():
            if r.name == name:
                return r
        return None

    async def list_roles(self) -> list[Role]:
        return list(self._roles.values())

    async def save_role(self, role: Role) -> None:
        self._roles[role.id] = role

    async def delete_role(self, role_id: str) -> None:
        self._roles.pop(role_id, None)
        to_delete = [
            aid for aid, a in self._assignments.items() if a.role_id == role_id
        ]
        for aid in to_delete:
            del self._assignments[aid]

    # Assignments

    async def get_assignment_by_id(
        self, assignment_id: str
    ) -> UserRoleAssignment | None:
        return self._assignments.get(assignment_id)

    async def list_assignments_for_user(
        self, user_id: str
    ) -> list[UserRoleAssignment]:
        return [a for a in self._assignments.values() if a.user_id == user_id]

    async def list_assignments_for_role(
        self, role_id: str
    ) -> list[UserRoleAssignment]:
        return [a for a in self._assignments.values() if a.role_id == role_id]

    async def list_all_assignments(self) -> list[UserRoleAssignment]:
        return list(self._assignments.values())

    async def save_assignment(self, assignment: UserRoleAssignment) -> None:
        self._assignments[assignment.id] = assignment

    async def delete_assignment(self, assignment_id: str) -> None:
        self._assignments.pop(assignment_id, None)

    async def delete_assignments_for_user(self, user_id: str) -> None:
        to_delete = [
            aid for aid, a in self._assignments.items() if a.user_id == user_id
        ]
        for aid in to_delete:
            del self._assignments[aid]

    async def update_null_asset_ids(self, root_asset_id: str) -> None:
        for a in self._assignments.values():
            if not a.asset_id:
                self._assignments[a.id] = a.model_copy(
                    update={"asset_id": root_asset_id}
                )


# ── Fixtures ──────────────────────────────────────────────────────────


@pytest.fixture
def users_storage() -> MemoryUsersStorage:
    return MemoryUsersStorage()


@pytest.fixture
def auth_storage() -> MemoryAuthorizationStorage:
    return MemoryAuthorizationStorage()


@pytest.fixture
def sample_user() -> UserInDB:
    return UserInDB(
        id="user-1",
        username="alice",
        hashed_password="$2b$12$fakehash",
        name="Alice",
        email="alice@example.com",
        title="Engineer",
    )


@pytest.fixture
def sample_role() -> Role:
    return Role(
        id="role-1",
        name="custom-role",
        description="A custom role",
        is_system=False,
        permissions=[Permission.DEVICES_READ, Permission.DEVICES_COMMAND],
    )


@pytest.fixture
def admin_role() -> Role:
    return Role(
        id="role-admin",
        name="admin",
        description="Full access",
        is_system=True,
        permissions=list(Permission),
    )


@pytest.fixture
def viewer_role() -> Role:
    return Role(
        id="role-viewer",
        name="viewer",
        description="Read-only",
        is_system=True,
        permissions=[
            Permission.DEVICES_READ,
            Permission.DRIVERS_READ,
            Permission.TRANSPORTS_READ,
            Permission.TIMESERIES_READ,
            Permission.ASSETS_READ,
        ],
    )
