from users.models import Role
from users.permissions import Permission, get_permissions_for_role


def test_admin_holds_every_permission():
    assert get_permissions_for_role(Role.ADMIN) == sorted(Permission)


def test_operator_permissions():
    assert get_permissions_for_role(Role.OPERATOR) == [
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
        "timeseries:read",
        "transports:read",
        "transports:write",
    ]


def test_viewer_permissions():
    assert get_permissions_for_role(Role.VIEWER) == [
        "assets:read",
        "automations:read",
        "dashboards:read",
        "devices:read",
        "drivers:read",
        "timeseries:read",
        "transports:read",
        "users:read:basic",
    ]
