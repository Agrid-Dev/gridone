from users.permissions import Permission
from users.roles import BUILTIN_ROLES, find_builtin_role, get_permissions_for_role


def test_builtin_roles_are_admin_operator_viewer():
    assert [role.id for role in BUILTIN_ROLES] == ["admin", "operator", "viewer"]
    assert all(role.builtin for role in BUILTIN_ROLES)


def test_admin_holds_every_permission():
    assert get_permissions_for_role("admin") == sorted(Permission)


def test_operator_permissions():
    assert get_permissions_for_role("operator") == [
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
        "roles:read",
        "timeseries:read",
        "transports:read",
        "transports:write",
    ]


def test_viewer_permissions():
    assert get_permissions_for_role("viewer") == [
        "assets:read",
        "automations:read",
        "dashboards:read",
        "devices:read",
        "drivers:read",
        "roles:read",
        "timeseries:read",
        "transports:read",
        "users:read:basic",
    ]


def test_unknown_role_has_no_permission():
    assert find_builtin_role("ghost") is None
    assert get_permissions_for_role("ghost") == []
