from typing import Protocol

from users.models import UserInDB


class UsersStorageBackend(Protocol):
    async def get_by_id(self, user_id: str) -> UserInDB | None: ...

    async def get_by_username(self, username: str) -> UserInDB | None: ...

    async def list_all(self) -> list[UserInDB]: ...

    async def save(self, user: UserInDB) -> None: ...

    async def delete(self, user_id: str) -> None: ...


__all__ = ["UsersStorageBackend"]
