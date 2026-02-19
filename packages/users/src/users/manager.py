import uuid

from users.models import User, UserInDB
from users.password import hash_password
from users.storage.storage_backend import UsersStorageBackend


class UsersManager:
    def __init__(self, storage: UsersStorageBackend) -> None:
        self._storage = storage

    async def ensure_default_admin(self) -> None:
        """Create the default admin/admin user if no users exist."""
        existing = await self._storage.list_all()
        if existing:
            return
        admin = UserInDB(
            id=str(uuid.uuid4()),
            username="admin",
            hashed_password=hash_password("admin"),
            is_admin=True,
            must_change_password=True,
        )
        await self._storage.save(admin)

    async def get_by_username(self, username: str) -> UserInDB | None:
        return await self._storage.get_by_username(username)

    async def get_by_id(self, user_id: str) -> UserInDB | None:
        return await self._storage.get_by_id(user_id)

    async def list_users(self) -> list[User]:
        users = await self._storage.list_all()
        return [User.model_validate(u.model_dump()) for u in users]

    async def create_user(
        self,
        username: str,
        password: str,
        is_admin: bool = False,
        name: str = "",
        email: str = "",
        title: str = "",
    ) -> User:
        existing = await self._storage.get_by_username(username)
        if existing is not None:
            msg = f"Username '{username}' already exists"
            raise ValueError(msg)
        user = UserInDB(
            id=str(uuid.uuid4()),
            username=username,
            hashed_password=hash_password(password),
            is_admin=is_admin,
            name=name,
            email=email,
            title=title,
            must_change_password=False,
        )
        await self._storage.save(user)
        return User.model_validate(user.model_dump())

    async def update_user(
        self,
        user_id: str,
        *,
        username: str | None = None,
        password: str | None = None,
        is_admin: bool | None = None,
        name: str | None = None,
        email: str | None = None,
        title: str | None = None,
        must_change_password: bool | None = None,
    ) -> User:
        user = await self._storage.get_by_id(user_id)
        if user is None:
            msg = f"User '{user_id}' not found"
            raise FileNotFoundError(msg)
        if username is not None:
            conflict = await self._storage.get_by_username(username)
            if conflict is not None and conflict.id != user_id:
                msg = f"Username '{username}' already exists"
                raise ValueError(msg)
            user = user.model_copy(update={"username": username})
        if password is not None:
            user = user.model_copy(
                update={
                    "hashed_password": hash_password(password),
                    "must_change_password": False,
                }
            )
        if is_admin is not None:
            user = user.model_copy(update={"is_admin": is_admin})
        if name is not None:
            user = user.model_copy(update={"name": name})
        if email is not None:
            user = user.model_copy(update={"email": email})
        if title is not None:
            user = user.model_copy(update={"title": title})
        if must_change_password is not None:
            user = user.model_copy(update={"must_change_password": must_change_password})
        await self._storage.save(user)
        return User.model_validate(user.model_dump())

    async def delete_user(self, user_id: str) -> None:
        user = await self._storage.get_by_id(user_id)
        if user is None:
            msg = f"User '{user_id}' not found"
            raise FileNotFoundError(msg)
        await self._storage.delete(user_id)


__all__ = ["UsersManager"]
