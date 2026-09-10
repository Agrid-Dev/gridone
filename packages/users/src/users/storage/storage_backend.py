from typing import Protocol

from users.models import UserInDB, UserUpdate


class UsersStorageBackend(Protocol):
    async def get_by_id(self, user_id: str) -> UserInDB | None: ...

    async def get_by_username(self, username: str) -> UserInDB | None: ...

    async def list_all(self) -> list[UserInDB]: ...

    async def save(self, user: UserInDB) -> None: ...

    async def update(self, user_id: str, update: UserUpdate) -> UserInDB | None:
        """Write only the fields set on ``update``; None when the user is gone.

        Unlike ``save`` this cannot clobber a field another writer changed
        between the caller's read and this write.
        """
        ...

    async def delete(self, user_id: str) -> None: ...

    async def close(self) -> None: ...


__all__ = ["UsersStorageBackend"]
