from typing import Protocol

from users.roles import Role, RoleUpdate


class RolesStorageBackend(Protocol):
    """Persistence of custom roles. Built-ins never reach storage."""

    async def get(self, role_id: str) -> Role | None: ...

    async def list_all(self) -> list[Role]: ...

    async def insert(self, role: Role) -> None:
        """Add a new role; ``ConflictError`` when the id is already taken.

        An insert, not an upsert: two concurrent creations of the same id
        must end with one winner and one refusal, which only the store can
        decide. ``update`` owns the edit path.
        """
        ...

    async def update(self, role_id: str, update: RoleUpdate) -> Role | None:
        """Write only the fields set on ``update``; None when the role is gone."""
        ...

    async def delete(self, role_id: str) -> None: ...


__all__ = ["RolesStorageBackend"]
