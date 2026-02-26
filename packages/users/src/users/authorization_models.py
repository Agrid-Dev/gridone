from enum import StrEnum

from pydantic import BaseModel


class Permission(StrEnum):
    """All recognised resource:action permission strings."""

    DEVICES_READ = "devices:read"
    DEVICES_MANAGE = "devices:manage"
    DEVICES_COMMAND = "devices:command"
    DRIVERS_READ = "drivers:read"
    DRIVERS_MANAGE = "drivers:manage"
    TRANSPORTS_READ = "transports:read"
    TRANSPORTS_MANAGE = "transports:manage"
    TIMESERIES_READ = "timeseries:read"
    ASSETS_READ = "assets:read"
    ASSETS_MANAGE = "assets:manage"
    USERS_READ = "users:read"
    USERS_MANAGE = "users:manage"
    ROLES_READ = "roles:read"
    ROLES_MANAGE = "roles:manage"


ALL_PERMISSIONS: list[Permission] = list(Permission)


class Role(BaseModel):
    """Public role model."""

    id: str
    name: str
    description: str = ""
    is_system: bool = False
    permissions: list[Permission] = []


class RoleCreate(BaseModel):
    name: str
    description: str = ""
    permissions: list[Permission] = []


class RoleUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    permissions: list[Permission] | None = None


class UserRoleAssignment(BaseModel):
    """A single role-to-user binding, scoped to an asset node."""

    id: str
    user_id: str
    role_id: str
    asset_id: str


class UserRoleAssignmentCreate(BaseModel):
    user_id: str
    role_id: str
    asset_id: str
