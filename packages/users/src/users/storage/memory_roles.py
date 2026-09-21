from dataclasses import dataclass, field

from users.roles import Role, RoleUpdate


@dataclass
class MemoryRolesStorage:
    _roles: dict[str, Role] = field(default_factory=dict)

    async def get(self, role_id: str) -> Role | None:
        return self._roles.get(role_id)

    async def list_all(self) -> list[Role]:
        return sorted(self._roles.values(), key=lambda role: role.id)

    async def save(self, role: Role) -> None:
        self._roles[role.id] = role

    async def update(self, role_id: str, update: RoleUpdate) -> Role | None:
        role = self._roles.get(role_id)
        if role is None:
            return None
        updated = update.apply_to(role)
        self._roles[role_id] = updated
        return updated

    async def delete(self, role_id: str) -> None:
        self._roles.pop(role_id, None)


__all__ = ["MemoryRolesStorage"]
