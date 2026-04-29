from dataclasses import dataclass, field

from users.models import UserInDB


@dataclass
class MemoryUsersStorage:
    _users: dict[str, UserInDB] = field(default_factory=dict)

    async def get_by_id(self, user_id: str) -> UserInDB | None:
        return self._users.get(user_id)

    async def get_by_username(self, username: str) -> UserInDB | None:
        for user in self._users.values():
            if user.username == username:
                return user
        return None

    async def list_all(self) -> list[UserInDB]:
        return list(self._users.values())

    async def save(self, user: UserInDB) -> None:
        self._users[user.id] = user

    async def delete(self, user_id: str) -> None:
        self._users.pop(user_id, None)

    async def close(self) -> None:
        pass


__all__ = ["MemoryUsersStorage"]
