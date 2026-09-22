"""Roles: the permission vocabulary as data.

This subpackage never imports user models, user storage or the service; the
import contracts in the root ``pyproject.toml`` enforce it. ``UsersService``
is the one place where a role and a user meet.
"""

from users.roles.builtin import BUILTIN_ROLES, find_builtin_role
from users.roles.models import (
    NOT_YET_SCOPABLE,
    RESERVED_PERMISSIONS,
    ROLE_ID_MAX_LENGTH,
    ROLE_ID_PATTERN,
    SCOPABLE_PERMISSIONS,
    DeviceScope,
    DeviceSelector,
    Role,
    RoleCreate,
    RoleIdField,
    RoleUpdate,
    Scopes,
    check_scopes,
    known_permissions,
    known_scopes,
)

__all__ = [
    "BUILTIN_ROLES",
    "NOT_YET_SCOPABLE",
    "RESERVED_PERMISSIONS",
    "ROLE_ID_MAX_LENGTH",
    "ROLE_ID_PATTERN",
    "SCOPABLE_PERMISSIONS",
    "DeviceScope",
    "DeviceSelector",
    "Role",
    "RoleCreate",
    "RoleIdField",
    "RoleUpdate",
    "Scopes",
    "check_scopes",
    "find_builtin_role",
    "known_permissions",
    "known_scopes",
]
