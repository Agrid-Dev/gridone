"""The role document and its write DTOs.

Nothing here knows about users: a role is a named set of permissions, and
the only link to a user is the ``role`` string a user carries.
"""

from typing import Annotated

from pydantic import BaseModel, ConfigDict, StringConstraints, field_validator

from users.permissions import Permission

# A role id is a snake_case slug: lowercase letters and digits, underscore
# separated, e.g. ``thermostat_operator`` or ``level2_support``. It doubles
# as the JWT ``role`` claim and as ``User.role``, so it never changes.
ROLE_ID_PATTERN = r"^[a-z0-9]+(_[a-z0-9]+)*$"
ROLE_ID_MAX_LENGTH = 64

RoleIdField = Annotated[
    str, StringConstraints(pattern=ROLE_ID_PATTERN, max_length=ROLE_ID_MAX_LENGTH)
]


def _sort_permissions(permissions: list[Permission]) -> list[Permission]:
    """A role's permissions are a set: serve them in one canonical order."""
    return sorted(permissions)


class Role(BaseModel):
    """A named set of permissions users are assigned to, by id."""

    id: str
    name: str
    description: str = ""
    permissions: list[Permission]
    builtin: bool = False

    _sort = field_validator("permissions")(_sort_permissions)


class RoleCreate(BaseModel):
    """A custom role as submitted for creation.

    ``extra="forbid"`` is what rejects a ``scopes`` key until scopes ship:
    accepting and ignoring it would let a role author believe a restriction
    is in force.
    """

    model_config = ConfigDict(extra="forbid")

    id: RoleIdField
    name: str
    description: str = ""
    permissions: list[Permission]

    _sort = field_validator("permissions")(_sort_permissions)

    def to_role(self) -> Role:
        return Role(**self.model_dump())


class RoleUpdate(BaseModel):
    """A partial edit of a custom role; unset fields are left untouched."""

    model_config = ConfigDict(extra="forbid")

    name: str | None = None
    description: str | None = None
    permissions: list[Permission] | None = None

    @field_validator("permissions")
    @classmethod
    def _sort_if_set(
        cls, permissions: list[Permission] | None
    ) -> list[Permission] | None:
        return None if permissions is None else _sort_permissions(permissions)

    def apply_to(self, role: Role) -> Role:
        return role.model_copy(update=self.model_dump(exclude_none=True))


__all__ = [
    "ROLE_ID_MAX_LENGTH",
    "ROLE_ID_PATTERN",
    "Role",
    "RoleCreate",
    "RoleIdField",
    "RoleUpdate",
]
