"""Role-based access control: the permission vocabulary."""

from collections.abc import Iterable
from enum import StrEnum


class Permission(StrEnum):
    DOCUMENTS_READ = "documents:read"
    DOCUMENTS_WRITE = "documents:write"
    USERS_READ = "users:read"
    USERS_WRITE = "users:write"
    ROLES_READ = "roles:read"
    ROLES_WRITE = "roles:write"
    DEVICES_READ = "devices:read"
    DEVICES_WRITE = "devices:write"
    DEVICES_COMMAND = "devices:command"
    ASSETS_READ = "assets:read"
    ASSETS_WRITE = "assets:write"
    TRANSPORTS_READ = "transports:read"
    TRANSPORTS_WRITE = "transports:write"
    DRIVERS_READ = "drivers:read"
    DRIVERS_WRITE = "drivers:write"
    TIMESERIES_READ = "timeseries:read"
    AUTOMATIONS_READ = "automations:read"
    AUTOMATIONS_WRITE = "automations:write"
    NOTIFICATIONS_WRITE = "notifications:write"
    DEVICES_LOGS_READ = "devices:logs:read"
    DASHBOARDS_READ = "dashboards:read"
    DASHBOARDS_WRITE = "dashboards:write"
    SYNOPTICS_READ = "synoptics:read"
    SYNOPTICS_WRITE = "synoptics:write"
    OPERATING_RULES_READ = "operating_rules:read"
    OPERATING_RULES_WRITE = "operating_rules:write"


# Writing a resource implies reading it: no one wants a role that configures
# devices without seeing them. Every write permission is a key, so a new one
# must state what it implies.
IMPLIES: dict[Permission, frozenset[Permission]] = {
    Permission.DOCUMENTS_WRITE: frozenset({Permission.DOCUMENTS_READ}),
    Permission.USERS_WRITE: frozenset({Permission.USERS_READ}),
    Permission.ROLES_WRITE: frozenset({Permission.ROLES_READ}),
    Permission.DEVICES_WRITE: frozenset({Permission.DEVICES_READ}),
    Permission.DEVICES_COMMAND: frozenset({Permission.DEVICES_READ}),
    Permission.ASSETS_WRITE: frozenset({Permission.ASSETS_READ}),
    Permission.TRANSPORTS_WRITE: frozenset({Permission.TRANSPORTS_READ}),
    Permission.DRIVERS_WRITE: frozenset({Permission.DRIVERS_READ}),
    Permission.AUTOMATIONS_WRITE: frozenset({Permission.AUTOMATIONS_READ}),
    # Sending to others; your own notifications need no permission to read.
    Permission.NOTIFICATIONS_WRITE: frozenset(),
    Permission.DASHBOARDS_WRITE: frozenset({Permission.DASHBOARDS_READ}),
    Permission.SYNOPTICS_WRITE: frozenset({Permission.SYNOPTICS_READ}),
    Permission.OPERATING_RULES_WRITE: frozenset({Permission.OPERATING_RULES_READ}),
}


def effective(permissions: Iterable[Permission]) -> frozenset[Permission]:
    """Each permission plus what it implies."""
    held = frozenset(permissions)
    return held.union(*(IMPLIES.get(p, frozenset()) for p in held))
