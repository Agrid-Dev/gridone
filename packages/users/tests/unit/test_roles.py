import pytest
from pydantic import ValidationError

from users.permissions import Permission
from users.roles import (
    BUILTIN_ROLES,
    Role,
    RoleCreate,
    RoleUpdate,
    find_builtin_role,
    known_permissions,
)


def test_builtin_roles_are_admin_operator_viewer():
    assert [role.id for role in BUILTIN_ROLES] == ["admin", "operator", "viewer"]
    assert all(role.builtin for role in BUILTIN_ROLES)


def _builtin_permissions(role_id: str) -> list[Permission]:
    role = find_builtin_role(role_id)
    return list(role.permissions) if role is not None else []


def test_admin_holds_every_permission():
    assert _builtin_permissions("admin") == sorted(Permission)


def test_operator_permissions():
    assert _builtin_permissions("operator") == [
        "assets:read",
        "assets:write",
        "automations:read",
        "dashboards:read",
        "dashboards:write",
        "devices:command",
        "devices:read",
        "devices:write",
        "drivers:read",
        "drivers:write",
        "operating_rules:read",
        "roles:read",
        "synoptics:read",
        "synoptics:write",
        "timeseries:read",
        "transports:read",
        "transports:write",
    ]


def test_viewer_permissions():
    assert _builtin_permissions("viewer") == [
        "assets:read",
        "automations:read",
        "dashboards:read",
        "devices:read",
        "drivers:read",
        "operating_rules:read",
        "roles:read",
        "synoptics:read",
        "timeseries:read",
        "transports:read",
        "users:read:basic",
    ]


def test_unknown_role_has_no_permission():
    assert find_builtin_role("ghost") is None
    assert _builtin_permissions("ghost") == []


def test_role_serves_its_permissions_in_canonical_order():
    role = Role(
        id="custom",
        name="Custom",
        permissions=[Permission.USERS_READ_BASIC, Permission.ASSETS_READ],
    )
    assert role.permissions == [Permission.ASSETS_READ, Permission.USERS_READ_BASIC]


def test_builtin_role_documents_match_the_granted_permissions():
    for role in BUILTIN_ROLES:
        assert role.permissions == _builtin_permissions(role.id)


class TestRoleCreate:
    @pytest.mark.parametrize(
        "role_id", ["thermostat_operator", "level2", "a", "x_1_y", "a" * 64]
    )
    def test_accepts_snake_case_ids(self, role_id: str):
        assert RoleCreate(id=role_id, name="n", permissions=[]).id == role_id

    @pytest.mark.parametrize(
        "role_id",
        ["", "Admin", "with-dash", "_leading", "trailing_", "double__score", "a" * 65],
    )
    def test_rejects_ids_that_are_not_snake_case(self, role_id: str):
        with pytest.raises(ValidationError):
            RoleCreate(id=role_id, name="n", permissions=[])

    def test_rejects_an_unknown_permission(self):
        with pytest.raises(ValidationError):
            RoleCreate.model_validate(
                {"id": "x", "name": "n", "permissions": ["devices:fly"]}
            )

    def test_rejects_the_permission_reserved_for_admin(self):
        with pytest.raises(ValidationError, match="Reserved"):
            RoleCreate(id="x", name="n", permissions=[Permission.ROLES_WRITE])

    def test_rejects_scopes_until_they_ship(self):
        with pytest.raises(ValidationError):
            RoleCreate.model_validate(
                {
                    "id": "x",
                    "name": "n",
                    "permissions": [],
                    "scopes": {"devices:read": [{"types": ["thermostat"]}]},
                }
            )

    def test_to_role_is_never_builtin_and_sorts_permissions(self):
        role = RoleCreate(
            id="x",
            name="n",
            permissions=[Permission.USERS_READ_BASIC, Permission.ASSETS_READ],
        ).to_role()
        assert role.builtin is False
        assert role.permissions == [Permission.ASSETS_READ, Permission.USERS_READ_BASIC]


class TestRoleUpdate:
    def test_rejects_unknown_fields(self):
        with pytest.raises(ValidationError):
            RoleUpdate.model_validate({"scopes": {}})

    def test_rejects_the_permission_reserved_for_admin(self):
        with pytest.raises(ValidationError, match="Reserved"):
            RoleUpdate(permissions=[Permission.DEVICES_READ, Permission.ROLES_WRITE])

    def test_apply_to_changes_only_the_set_fields(self):
        role = Role(
            id="x",
            name="Old",
            description="kept",
            permissions=[Permission.ASSETS_READ],
        )

        updated = RoleUpdate(name="New", permissions=[]).apply_to(role)

        assert (updated.name, updated.description, updated.permissions) == (
            "New",
            "kept",
            [],
        )
        assert updated.id == "x"


class TestKnownPermissions:
    def test_drops_strings_the_vocabulary_no_longer_knows(self, caplog):
        with caplog.at_level("WARNING"):
            kept = known_permissions(
                ["devices:read", "devices:teleport", "assets:read"], role_id="x"
            )

        assert kept == [Permission.DEVICES_READ, Permission.ASSETS_READ]
        assert "devices:teleport" in caplog.text
