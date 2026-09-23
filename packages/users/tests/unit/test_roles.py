import pytest
from pydantic import ValidationError

from users.permissions import Permission
from users.roles import (
    BUILTIN_ROLES,
    DeviceScope,
    DeviceSelector,
    Role,
    RoleCreate,
    RoleUpdate,
    find_builtin_role,
    known_permissions,
    known_scopes,
)

THERMOSTATS = {"devices": {"types": ["thermostat"]}}


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

    def test_rejects_an_unknown_field(self):
        with pytest.raises(ValidationError):
            RoleCreate.model_validate(
                {"id": "x", "name": "n", "permissions": [], "builtin": True}
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
            RoleUpdate.model_validate({"builtin": True})

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


def _create(permissions: list[str], scopes: dict) -> RoleCreate:
    return RoleCreate.model_validate(
        {"id": "x", "name": "n", "permissions": permissions, "scopes": scopes}
    )


class TestScopes:
    @pytest.mark.parametrize(
        "scope",
        [
            pytest.param({}, id="everything"),
            pytest.param(THERMOSTATS, id="types"),
            pytest.param({"devices": {"driver_ids": ["vendor_x"]}}, id="driver_ids"),
            pytest.param({"attributes": ["temperature"]}, id="attributes"),
            pytest.param(
                {**THERMOSTATS, "attributes": ["temperature"]}, id="intersection"
            ),
        ],
    )
    def test_accepts_a_devices_read_scope_on_a_held_permission(self, scope: dict):
        role = _create(["devices:read"], {"devices:read": [scope]}).to_role()

        assert role.scopes == {
            Permission.DEVICES_READ: [DeviceScope.model_validate(scope)]
        }

    @pytest.mark.parametrize(
        "scopes",
        [
            pytest.param(
                {"devices:read": [{"tags": {"floor": "1"}}]}, id="scope-field"
            ),
            pytest.param(
                {"devices:read": [{"devices": {"tags": {"floor": "1"}}}]},
                id="selector-field",
            ),
            pytest.param({"devices:fly": [THERMOSTATS]}, id="permission-key"),
        ],
    )
    def test_the_shape_refuses_an_unknown_field_or_key(self, scopes: dict):
        with pytest.raises(ValidationError):
            _create(["devices:read"], scopes)

    def test_a_role_without_scopes_serves_an_empty_map(self):
        assert _create(["devices:read"], {}).to_role().scopes == {}

    @pytest.mark.parametrize(
        ("permissions", "scopes", "reason"),
        [
            pytest.param(
                ["devices:read", "devices:command"],
                {"devices:command": [THERMOSTATS]},
                "not scopable yet",
                id="devices-command-not-yet",
            ),
            pytest.param(
                ["assets:read"],
                {"assets:read": [{}]},
                "not scopable",
                id="not-scopable",
            ),
            pytest.param(
                ["devices:read"],
                {"devices:read": []},
                "empty",
                id="empty-list",
            ),
            pytest.param(
                ["timeseries:read"],
                {"devices:read": [THERMOSTATS]},
                "does not hold",
                id="permission-not-held",
            ),
        ],
    )
    def test_refuses_a_scope_that_exceeds_or_empties_its_permission(
        self, permissions: list[str], scopes: dict, reason: str
    ):
        with pytest.raises(ValidationError, match=reason):
            _create(permissions, scopes).to_role()

        with pytest.raises(ValidationError, match=reason):
            Role.model_validate(
                {"id": "x", "name": "n", "permissions": permissions, "scopes": scopes}
            )

    def test_apply_to_refuses_dropping_a_permission_its_scope_still_needs(self):
        role = _create(["devices:read"], {"devices:read": [THERMOSTATS]}).to_role()

        with pytest.raises(ValidationError, match="does not hold"):
            RoleUpdate(permissions=[Permission.TIMESERIES_READ]).apply_to(role)

    def test_apply_to_replaces_or_clears_the_scopes(self):
        role = _create(["devices:read"], {"devices:read": [THERMOSTATS]}).to_role()
        narrowed = RoleUpdate.model_validate(
            {"scopes": {"devices:read": [{"attributes": ["temperature"]}]}}
        ).apply_to(role)
        cleared = RoleUpdate.model_validate({"scopes": {}}).apply_to(narrowed)

        assert narrowed.scopes == {
            Permission.DEVICES_READ: [DeviceScope(attributes=["temperature"])]
        }
        assert cleared.scopes == {}
        assert cleared.permissions == [Permission.DEVICES_READ]


HELD = [Permission.DEVICES_READ, Permission.TIMESERIES_READ]


class TestKnownScopes:
    def test_keeps_a_scope_the_role_can_still_carry(self):
        permissions, scopes = known_scopes(
            {"devices:read": [{**THERMOSTATS, "attributes": ["temperature"]}]},
            permissions=HELD,
            role_id="x",
        )

        assert permissions == HELD
        assert scopes == {
            Permission.DEVICES_READ: [
                DeviceScope(
                    devices=DeviceSelector(types=["thermostat"]),
                    attributes=["temperature"],
                )
            ]
        }

    @pytest.mark.parametrize(
        "stored",
        [
            pytest.param({"devices:teleport": [THERMOSTATS]}, id="retired-key"),
            pytest.param({"assets:read": [THERMOSTATS]}, id="key-not-held"),
        ],
    )
    def test_ignores_a_key_that_narrows_nothing(self, stored: dict, caplog):
        with caplog.at_level("WARNING"):
            permissions, scopes = known_scopes(stored, permissions=HELD, role_id="x")

        assert (permissions, scopes) == (HELD, {})
        assert "ignored" in caplog.text

    def test_drops_only_the_entry_it_cannot_read(self, caplog):
        # A union of entries can only narrow: the readable one keeps the
        # restriction in force rather than the role reading every device.
        with caplog.at_level("ERROR"):
            permissions, scopes = known_scopes(
                {
                    "devices:read": [
                        {"devices": {"types": ["thermostat"], "tags": {"z": ["1"]}}},
                        {"devices": {"driver_ids": ["vendor"]}},
                    ]
                },
                permissions=HELD,
                role_id="x",
            )

        assert permissions == HELD
        assert scopes == {
            Permission.DEVICES_READ: [
                DeviceScope(devices=DeviceSelector(driver_ids=["vendor"]))
            ]
        }
        assert "dropped" in caplog.text

    @pytest.mark.parametrize(
        ("stored", "permissions"),
        [
            pytest.param(
                {"devices:read": [{"devices": {"tags": {"z": ["1"]}}}]},
                [Permission.DEVICES_READ, Permission.TIMESERIES_READ],
                id="no-readable-entry",
            ),
            pytest.param(
                {"devices:read": []},
                [Permission.DEVICES_READ, Permission.TIMESERIES_READ],
                id="empty-list",
            ),
            pytest.param(
                {"devices:command": [THERMOSTATS]},
                [Permission.DEVICES_COMMAND, Permission.TIMESERIES_READ],
                id="held-but-not-scopable",
            ),
        ],
    )
    def test_fails_closed_by_dropping_the_permission_it_cannot_narrow(
        self, stored: dict, permissions: list[Permission], caplog
    ):
        with caplog.at_level("ERROR"):
            kept, scopes = known_scopes(stored, permissions=permissions, role_id="x")

        assert kept == [Permission.TIMESERIES_READ]
        assert scopes == {}
        assert "permission dropped" in caplog.text
