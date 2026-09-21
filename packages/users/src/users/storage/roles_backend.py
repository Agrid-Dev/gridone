from typing import Protocol

from users.roles import Role, RoleUpdate


class RolesStorageBackend(Protocol):
    """Persistence of custom roles. Built-ins never reach storage."""

    async def get(self, role_id: str) -> Role | None: ...

    async def list_all(self) -> list[Role]: ...

    async def save(self, role: Role) -> None: ...

    async def update(self, role_id: str, update: RoleUpdate) -> Role | None:
        """Write only the fields set on ``update``; None when the role is gone."""
        ...

    async def delete(self, role_id: str) -> None: ...


__all__ = ["RolesStorageBackend"]
