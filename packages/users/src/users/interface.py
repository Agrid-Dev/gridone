"""Abstract interface for UsersManager consumed by other packages."""

from typing import Protocol

from users.models import User, UserCreate


class UsersManagerInterface(Protocol):
    """Protocol that other packages use to interact with user management."""

    async def create_user(
        self,
        create_data: UserCreate,
        *,
        pre_hashed_password: str | None = None,
    ) -> User: ...


__all__ = ["UsersManagerInterface"]
