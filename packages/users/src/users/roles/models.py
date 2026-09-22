"""The role document and its write DTOs.

Nothing here knows about users: a role is a named set of permissions, and
the only link to a user is the ``role`` string a user carries.
"""

import logging
from collections.abc import Collection
from typing import Annotated, Any, Self

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

from users.permissions import Permission

logger = logging.getLogger(__name__)

# A role id is a snake_case slug: lowercase letters and digits, underscore
# separated, e.g. ``thermostat_operator`` or ``level2_support``. It doubles
# as the JWT ``role`` claim and as ``User.role``, so it never changes.
ROLE_ID_PATTERN = r"^[a-z0-9]+(_[a-z0-9]+)*$"
ROLE_ID_MAX_LENGTH = 64

RoleIdField = Annotated[
    str, StringConstraints(pattern=ROLE_ID_PATTERN, max_length=ROLE_ID_MAX_LENGTH)
]

# Held by the built-in admin only: a role that could mint roles could mint
# one richer than itself.
RESERVED_PERMISSIONS: frozenset[Permission] = frozenset({Permission.ROLES_WRITE})

# Permissions a scope can narrow. ``devices:command`` is scopable by design
# (ADR 0004) but no write path enforces it yet: refusing it keeps a role author
# from believing a write restriction is in force.
SCOPABLE_PERMISSIONS: frozenset[Permission] = frozenset({Permission.DEVICES_READ})
NOT_YET_SCOPABLE: frozenset[Permission] = frozenset({Permission.DEVICES_COMMAND})


def _sort_permissions(permissions: list[Permission]) -> list[Permission]:
    """A role's permissions are a set: serve them in one canonical order."""
    return sorted(permissions)


def _custom_role_permissions(permissions: list[Permission]) -> list[Permission]:
    reserved = RESERVED_PERMISSIONS.intersection(permissions)
    if reserved:
        msg = f"Reserved for the built-in admin role: {', '.join(sorted(reserved))}"
        raise ValueError(msg)
    return _sort_permissions(permissions)


def known_permissions(values: list[str], *, role_id: str) -> list[Permission]:
    """Keep the permission strings the vocabulary still knows.

    Stored roles outlive the vocabulary: a member retired in a later release
    must not make the row, let alone every custom role, unreadable. The
    dropped strings are logged so the deployment can clean the role up.
    """
    known: list[Permission] = []
    for value in values:
        try:
            known.append(Permission(value))
        except ValueError:
            logger.warning(
                "Role %r holds unknown permission %r; ignored", role_id, value
            )
    return known


class DeviceSelector(BaseModel):
    """Which devices a scope reaches: by standard type, by driver, or both.

    Fields intersect: every field that is set must match, and a field left
    out is no constraint, so ``{}`` selects every device. ``types`` are the
    standard device types a driver declares, so an untyped driver is reachable
    through ``driver_ids`` only. Ids and tags are deliberately absent: ids do
    not survive a device recreation and tags are operator-editable.
    """

    model_config = ConfigDict(extra="forbid")

    types: list[str] | None = None
    driver_ids: list[str] | None = None


class DeviceScope(BaseModel):
    """One cell of the devices-by-attributes grid a permission is narrowed to.

    Two levels, as in ``models.targets.AttributeTarget``: ``devices`` selects
    the devices, ``attributes`` the attributes of those devices (``None`` is
    every attribute). A scope with neither matches everything.
    """

    model_config = ConfigDict(extra="forbid")

    devices: DeviceSelector = Field(default_factory=DeviceSelector)
    attributes: list[str] | None = None


# Keyed by the permission each list narrows: a scope has no vocabulary of its
# own and cannot drift from the permission names.
Scopes = dict[Permission, list[DeviceScope]]


def check_scopes(permissions: Collection[Permission], scopes: Scopes) -> None:
    """Refuse a scope that would exceed, or empty out, its permission."""
    for permission, entries in scopes.items():
        if permission in NOT_YET_SCOPABLE:
            msg = f"{permission} is not scopable yet"
            raise ValueError(msg)
        if permission not in SCOPABLE_PERMISSIONS:
            msg = f"{permission} is not scopable"
            raise ValueError(msg)
        if not entries:
            msg = f"Scope list for {permission} is empty; drop the key instead"
            raise ValueError(msg)
        if permission not in permissions:
            msg = f"Scope on a permission the role does not hold: {permission}"
            raise ValueError(msg)


def known_scopes(
    values: dict[str, list[dict[str, Any]]],
    *,
    permissions: Collection[Permission],
    role_id: str,
) -> Scopes:
    """Keep the stored scopes the role can still carry, like ``known_permissions``.

    A key the vocabulary no longer knows, no longer scopable, or no longer
    among the role's permissions is dropped and logged rather than failing
    the row (and with it every custom role, since they load together).
    """
    known: Scopes = {}
    for key, entries in values.items():
        try:
            # pydantic's ValidationError is a ValueError: one except covers
            # an unknown key, an unknown scope field and a scope rule alike.
            scopes = {Permission(key): [DeviceScope.model_validate(e) for e in entries]}
            check_scopes(permissions, scopes)
        except ValueError as exc:
            logger.warning(
                "Role %r holds an unusable scope on %r (%s); ignored", role_id, key, exc
            )
            continue
        known.update(scopes)
    return known


class Role(BaseModel):
    """A named set of permissions users are assigned to, by id.

    ``scopes`` narrows a permission to devices and attributes; a permission
    without a scope keeps its full reach. The document is shape-validated
    here and evaluated by the API layer only.
    """

    id: str
    name: str
    description: str = ""
    permissions: list[Permission]
    scopes: Scopes = Field(default_factory=dict)
    builtin: bool = False

    _sort = field_validator("permissions")(_sort_permissions)

    @model_validator(mode="after")
    def _scopes_within_permissions(self) -> Self:
        check_scopes(self.permissions, self.scopes)
        return self


class RoleCreate(BaseModel):
    """A custom role as submitted for creation.

    ``extra="forbid"`` turns a misspelt key into a 422 rather than a silently
    ignored one, so a role author never believes a restriction is in force.
    The scope rules are the role's own: ``to_role`` applies them.
    """

    model_config = ConfigDict(extra="forbid")

    id: RoleIdField
    name: str
    description: str = ""
    permissions: list[Permission]
    scopes: Scopes = Field(default_factory=dict)

    _custom = field_validator("permissions")(_custom_role_permissions)

    def to_role(self) -> Role:
        return Role(**self.model_dump())


class RoleUpdate(BaseModel):
    """A partial edit of a custom role; unset fields are left untouched.

    ``scopes`` replaces the whole map when set (``{}`` clears it). The scope
    rules need the stored document, so ``apply_to`` re-validates it whole.
    """

    model_config = ConfigDict(extra="forbid")

    name: str | None = None
    description: str | None = None
    permissions: list[Permission] | None = None
    scopes: Scopes | None = None

    @field_validator("permissions")
    @classmethod
    def _custom_if_set(
        cls, permissions: list[Permission] | None
    ) -> list[Permission] | None:
        return None if permissions is None else _custom_role_permissions(permissions)

    def apply_to(self, role: Role) -> Role:
        """The stored role with this edit applied, validated as a whole.

        ``model_copy`` skips validators, and dropping a permission whose scope
        stays behind must fail.
        """
        return Role.model_validate(
            {**role.model_dump(), **self.model_dump(exclude_none=True)}
        )


__all__ = [
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
    "known_permissions",
    "known_scopes",
]
