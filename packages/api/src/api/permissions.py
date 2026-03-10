"""Role-based access control: permission definitions and role→permission mapping."""

from enum import StrEnum

from users.models import Role


class Permission(StrEnum):
    USERS_READ = "users:read"
    USERS_WRITE = "users:write"
    DEVICES_READ = "devices:read"
    DEVICES_WRITE = "devices:write"
    ASSETS_READ = "assets:read"
    ASSETS_WRITE = "assets:write"
    TRANSPORTS_READ = "transports:read"
    TRANSPORTS_WRITE = "transports:write"
    DRIVERS_READ = "drivers:read"
    DRIVERS_WRITE = "drivers:write"
    TIMESERIES_READ = "timeseries:read"


ROLE_PERMISSIONS: dict[Role, set[Permission]] = {
    Role.ADMIN: set(Permission),
    Role.OPERATOR: {
        Permission.DEVICES_READ,
        Permission.DEVICES_WRITE,
        Permission.ASSETS_READ,
        Permission.ASSETS_WRITE,
        Permission.TRANSPORTS_READ,
        Permission.TRANSPORTS_WRITE,
        Permission.DRIVERS_READ,
        Permission.DRIVERS_WRITE,
        Permission.TIMESERIES_READ,
    },
    Role.VIEWER: {
        Permission.DEVICES_READ,
        Permission.ASSETS_READ,
        Permission.TRANSPORTS_READ,
        Permission.DRIVERS_READ,
        Permission.TIMESERIES_READ,
    },
}


def get_permissions_for_role(role: Role) -> list[str]:
    """Return the sorted list of permission strings for a given role."""
    return sorted(ROLE_PERMISSIONS.get(role, set()))
