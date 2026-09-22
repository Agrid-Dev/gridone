"""Roles: the permission vocabulary as data.

This subpackage never imports user models, user storage or the service; the
import contracts in the root ``pyproject.toml`` enforce it. ``UsersService``
is the one place where a role and a user meet.
"""

from users.roles.builtin import BUILTIN_ROLES, find_builtin_role
from users.roles.models import (
    RESERVED_PERMISSIONS,
    ROLE_ID_MAX_LENGTH,
    ROLE_ID_PATTERN,
    Role,
    RoleCreate,
    RoleIdField,
    RoleUpdate,
    known_permissions,
)

__all__ = [
    "BUILTIN_ROLES",
    "RESERVED_PERMISSIONS",
    "ROLE_ID_MAX_LENGTH",
    "ROLE_ID_PATTERN",
    "Role",
    "RoleCreate",
    "RoleIdField",
    "RoleUpdate",
    "find_builtin_role",
    "known_permissions",
]
