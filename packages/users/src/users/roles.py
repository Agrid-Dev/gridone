"""Built-in roles: defined in code, immutable, served like any other role."""

from users.models import Role
from users.permissions import Permission

BUILTIN_ROLES: tuple[Role, ...] = (
    Role(
        id="admin",
        name="Administrator",
        description="Full access, including users and roles.",
        permissions=sorted(Permission),
        builtin=True,
    ),
    Role(
        id="operator",
        name="Operator",
        description="Building control and configuration, no user management.",
        permissions=[
            Permission.ROLES_READ,
            Permission.DEVICES_READ,
            Permission.DEVICES_WRITE,
            Permission.DEVICES_COMMAND,
            Permission.ASSETS_READ,
            Permission.ASSETS_WRITE,
            Permission.TRANSPORTS_READ,
            Permission.TRANSPORTS_WRITE,
            Permission.DRIVERS_READ,
            Permission.DRIVERS_WRITE,
            Permission.TIMESERIES_READ,
            Permission.AUTOMATIONS_READ,
            Permission.DASHBOARDS_READ,
            Permission.DASHBOARDS_WRITE,
        ],
        builtin=True,
    ),
    Role(
        id="viewer",
        name="Viewer",
        description="Read-only access.",
        permissions=[
            Permission.USERS_READ_BASIC,
            Permission.ROLES_READ,
            Permission.DEVICES_READ,
            Permission.ASSETS_READ,
            Permission.TRANSPORTS_READ,
            Permission.DRIVERS_READ,
            Permission.TIMESERIES_READ,
            Permission.AUTOMATIONS_READ,
            Permission.DASHBOARDS_READ,
        ],
        builtin=True,
    ),
)

_BUILTIN_BY_ID: dict[str, Role] = {role.id: role for role in BUILTIN_ROLES}


def find_builtin_role(role_id: str) -> Role | None:
    return _BUILTIN_BY_ID.get(role_id)


def get_permissions_for_role(role_id: str) -> list[str]:
    """Return the sorted permission strings of a role; none for an unknown id."""
    role = find_builtin_role(role_id)
    return sorted(role.permissions) if role is not None else []
