"""Role behaviour of ``UsersService``, run against every storage backend.

The memory backend always runs; the postgres backend is opt-in through
``POSTGRES_TEST_URL`` and carries the ``integration`` marker.
"""

import os
from collections.abc import AsyncIterator

import asyncpg
import pytest
import pytest_asyncio

from models.errors import ConflictError, InvalidError, NotFoundError
from users import (
    RoleCreate,
    RoleUpdate,
    User,
    UserCreate,
    UsersService,
    UserUpdate,
)
from users.permissions import Permission

POSTGRES_URL = os.environ.get("POSTGRES_TEST_URL")

pytestmark = pytest.mark.asyncio

BACKENDS = [
    pytest.param(None, id="memory"),
    pytest.param(
        POSTGRES_URL,
        id="postgres",
        marks=[
            pytest.mark.integration,
            pytest.mark.skipif(
                POSTGRES_URL is None, reason="POSTGRES_TEST_URL not set"
            ),
        ],
    ),
]

OPERATOR_LIKE = RoleCreate(
    id="thermostat_operator",
    name="Thermostat operator",
    description="Reads the building and adjusts comfort settings.",
    permissions=[
        Permission.DEVICES_READ,
        Permission.DEVICES_COMMAND,
        Permission.TIMESERIES_READ,
    ],
)


async def _wipe(url: str) -> None:
    conn = await asyncpg.connect(url)
    try:
        await conn.execute("DELETE FROM users; DELETE FROM roles")
    finally:
        await conn.close()


@pytest_asyncio.fixture(params=BACKENDS)
async def service(request: pytest.FixtureRequest) -> AsyncIterator[UsersService]:
    url: str | None = request.param
    svc = UsersService(url, admin_password="admin-password")
    await svc.start()
    if url is not None:
        # start() ran the migrations, so the tables exist; reseed the admin
        # the wipe just removed so the service state matches the memory run.
        await _wipe(url)
        await svc.ensure_default_admin()
    yield svc
    await svc.stop()


async def _new_user(service: UsersService, role: str, username: str = "alice") -> User:
    return await service.create_user(
        UserCreate(username=username, password="password12345", role=role)
    )


class TestCreate:
    async def test_created_role_is_served_after_the_builtins(
        self, service: UsersService
    ):
        created = await service.create_role(OPERATOR_LIKE)

        assert created.builtin is False
        assert await service.get_role("thermostat_operator") == created
        assert [r.id for r in await service.list_roles()] == [
            "admin",
            "operator",
            "viewer",
            "thermostat_operator",
        ]

    async def test_permissions_are_served_sorted(self, service: UsersService):
        created = await service.create_role(OPERATOR_LIKE)

        assert created.permissions == [
            Permission.DEVICES_COMMAND,
            Permission.DEVICES_READ,
            Permission.TIMESERIES_READ,
        ]
        assert (await service.get_role("thermostat_operator")).permissions == (
            created.permissions
        )

    async def test_duplicate_id_is_refused(self, service: UsersService):
        await service.create_role(OPERATOR_LIKE)

        with pytest.raises(ConflictError):
            await service.create_role(OPERATOR_LIKE)

    @pytest.mark.parametrize("builtin_id", ["admin", "operator", "viewer"])
    async def test_builtin_id_is_refused(self, service: UsersService, builtin_id: str):
        with pytest.raises(ConflictError):
            await service.create_role(
                RoleCreate(id=builtin_id, name="Shadow", permissions=[])
            )


class TestUpdate:
    async def test_partial_update_keeps_the_other_fields(self, service: UsersService):
        await service.create_role(OPERATOR_LIKE)

        updated = await service.update_role(
            "thermostat_operator", RoleUpdate(permissions=[Permission.DEVICES_READ])
        )

        assert updated.permissions == [Permission.DEVICES_READ]
        assert updated.name == OPERATOR_LIKE.name
        assert updated.description == OPERATOR_LIKE.description
        assert await service.get_role("thermostat_operator") == updated

    async def test_unknown_role_is_not_found(self, service: UsersService):
        with pytest.raises(NotFoundError):
            await service.update_role("ghost", RoleUpdate(name="Ghost"))

    @pytest.mark.parametrize("builtin_id", ["admin", "operator", "viewer"])
    async def test_builtin_is_immutable(self, service: UsersService, builtin_id: str):
        with pytest.raises(ConflictError):
            await service.update_role(builtin_id, RoleUpdate(name="Renamed"))


class TestDelete:
    async def test_deleted_role_is_gone(self, service: UsersService):
        await service.create_role(OPERATOR_LIKE)

        await service.delete_role("thermostat_operator")

        with pytest.raises(NotFoundError):
            await service.get_role("thermostat_operator")
        assert [r.id for r in await service.list_roles()] == [
            "admin",
            "operator",
            "viewer",
        ]

    async def test_unknown_role_is_not_found(self, service: UsersService):
        with pytest.raises(NotFoundError):
            await service.delete_role("ghost")

    @pytest.mark.parametrize("builtin_id", ["admin", "operator", "viewer"])
    async def test_builtin_cannot_be_deleted(
        self, service: UsersService, builtin_id: str
    ):
        with pytest.raises(ConflictError):
            await service.delete_role(builtin_id)

    async def test_assigned_role_cannot_be_deleted_until_the_user_is_gone(
        self, service: UsersService
    ):
        await service.create_role(OPERATOR_LIKE)
        user = await _new_user(service, "thermostat_operator")

        with pytest.raises(ConflictError):
            await service.delete_role("thermostat_operator")

        await service.delete_user(user.id)
        await service.delete_role("thermostat_operator")


class TestPermissionResolution:
    async def test_builtin_custom_and_unknown(self, service: UsersService):
        await service.create_role(OPERATOR_LIKE)

        assert await service.get_role_permissions("admin") == sorted(Permission)
        assert await service.get_role_permissions("thermostat_operator") == [
            Permission.DEVICES_COMMAND,
            Permission.DEVICES_READ,
            Permission.TIMESERIES_READ,
        ]
        assert await service.get_role_permissions("ghost") == []

    async def test_an_edit_is_visible_on_the_next_lookup(self, service: UsersService):
        await service.create_role(OPERATOR_LIKE)
        assert Permission.DEVICES_READ in await service.get_role_permissions(
            "thermostat_operator"
        )

        await service.update_role(
            "thermostat_operator", RoleUpdate(permissions=[Permission.DEVICES_COMMAND])
        )

        assert await service.get_role_permissions("thermostat_operator") == [
            Permission.DEVICES_COMMAND
        ]

    async def test_a_deleted_role_resolves_to_nothing(self, service: UsersService):
        await service.create_role(OPERATOR_LIKE)
        await service.delete_role("thermostat_operator")

        assert await service.get_role_permissions("thermostat_operator") == []


class TestUsersReferenceRoles:
    async def test_a_user_can_hold_a_custom_role(self, service: UsersService):
        await service.create_role(OPERATOR_LIKE)

        user = await _new_user(service, "thermostat_operator")

        assert user.role == "thermostat_operator"

    async def test_a_user_cannot_hold_an_unknown_role(self, service: UsersService):
        with pytest.raises(InvalidError):
            await _new_user(service, "ghost")

    async def test_a_user_can_move_to_a_custom_role(self, service: UsersService):
        await service.create_role(OPERATOR_LIKE)
        user = await _new_user(service, "viewer")

        moved = await service.update_user(
            user.id, UserUpdate(role="thermostat_operator")
        )

        assert moved.role == "thermostat_operator"
