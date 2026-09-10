"""Role-based access control: the permission vocabulary."""

from enum import StrEnum


class Permission(StrEnum):
    USERS_READ = "users:read"
    USERS_READ_BASIC = "users:read:basic"
    USERS_WRITE = "users:write"
    ROLES_READ = "roles:read"
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
