import uuid

from models.errors import NotFoundError

from users.models import User, UserCreate, UserInDB, UserUpdate
from users.password import hash_password, verify_password
from users.storage.storage_backend import UsersStorageBackend


class UsersManager:
    def __init__(self, storage: UsersStorageBackend) -> None:
        self._storage = storage

    @staticmethod
    def _to_public_user(user: UserInDB) -> User:
        return User.model_validate(user.model_dump())

    async def _get_in_db_or_raise(self, user_id: str) -> UserInDB:
        user = await self._storage.get_by_id(user_id)
        if user is None:
            msg = f"User '{user_id}' not found"
            raise NotFoundError(msg)
        return user

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

    async def get_by_username(self, username: str) -> User | None:
        user = await self._storage.get_by_username(username)
        if user is None:
            return None
        return self._to_public_user(user)

    async def get_by_id(self, user_id: str) -> User:
        user = await self._get_in_db_or_raise(user_id)
        return self._to_public_user(user)

    async def authenticate(self, username: str, password: str) -> User | None:
        user = await self._storage.get_by_username(username)
        if user is None:
            return None
        if not verify_password(password, user.hashed_password):
            return None
        return self._to_public_user(user)

    async def list_users(self) -> list[User]:
        users = await self._storage.list_all()
        return [self._to_public_user(u) for u in users]

    async def create_user(
        self, create_data: UserCreate
    ) -> User:
        existing = await self._storage.get_by_username(create_data.username)
        if existing is not None:
            msg = f"Username '{create_data.username}' already exists"
            raise ValueError(msg)
        user = UserInDB(
            id=str(uuid.uuid4()),
            username=create_data.username,
            hashed_password=hash_password(create_data.password),
            is_admin=create_data.is_admin,
            name=create_data.name,
            email=create_data.email,
            title=create_data.title,
            must_change_password=False,
        )
        await self._storage.save(user)
        return self._to_public_user(user)

    async def update_user(
        self,
        user_id: str,
        update_data: UserUpdate,
    ) -> User:
        user = await self._get_in_db_or_raise(user_id)

        if update_data.username is not None:
            conflict = await self._storage.get_by_username(update_data.username)
            if conflict is not None and conflict.id != user_id:
                msg = f"Username '{update_data.username}' already exists"
                raise ValueError(msg)

        updated_user = user.update(update_data)
        await self._storage.save(updated_user)
        return self._to_public_user(updated_user)

    async def delete_user(self, user_id: str) -> None:
        await self._get_in_db_or_raise(user_id)
        await self._storage.delete(user_id)


__all__ = ["UsersManager"]
