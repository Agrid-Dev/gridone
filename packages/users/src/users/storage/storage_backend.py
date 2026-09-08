from typing import Protocol

from users.models import UserInDB


class UsersStorageBackend(Protocol):
    async def get_by_id(self, user_id: str) -> UserInDB | None: ...

    async def get_by_username(self, username: str) -> UserInDB | None: ...

    async def list_all(self) -> list[UserInDB]: ...

    async def save(self, user: UserInDB) -> None: ...

    async def update_password(
        self, user_id: str, hashed_password: str
    ) -> UserInDB | None:
        """Atomically set the password and clear must_change_password.

        Unlike ``save``, this touches only these two columns, so it can't
        clobber a concurrent change to another field (e.g. ``is_blocked``)
        made between reading the user and writing the new password.
        """
        ...

    async def delete(self, user_id: str) -> None: ...

    async def close(self) -> None: ...


__all__ = ["UsersStorageBackend"]
