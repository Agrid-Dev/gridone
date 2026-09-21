"""Roles: the permission vocabulary as data.

This subpackage never imports user models, user storage or the service; the
import contracts in the root ``pyproject.toml`` enforce it. ``UsersService``
is the one place where a role and a user meet.
"""

from users.roles.builtin import (
    BUILTIN_ROLES,
    find_builtin_role,
    get_permissions_for_role,
)
from users.roles.models import (
    ROLE_ID_MAX_LENGTH,
    ROLE_ID_PATTERN,
    Role,
    RoleCreate,
    RoleIdField,
    RoleUpdate,
)

__all__ = [
    "BUILTIN_ROLES",
    "ROLE_ID_MAX_LENGTH",
    "ROLE_ID_PATTERN",
    "Role",
    "RoleCreate",
    "RoleIdField",
    "RoleUpdate",
    "find_builtin_role",
    "get_permissions_for_role",
]
