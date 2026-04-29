from models.errors import BlockedUserError, NotFoundError
from models.ids import gen_id
from users.models import Role, User, UserCreate, UserInDB, UserUpdate
from users.password import hash_password, verify_password
from users.storage import build_users_storage
from users.storage.storage_backend import UsersStorageBackend


class UsersService:
    def __init__(self, storage_url: str | None) -> None:
        self._storage_url = storage_url
        self._storage: UsersStorageBackend | None = None

    async def start(self) -> None:
        self._storage = await build_users_storage(self._storage_url)
        await self.ensure_default_admin()

    async def stop(self) -> None:
        if self._storage is not None:
            await self._storage.close()
            self._storage = None

    @property
    def _backend(self) -> UsersStorageBackend:
        if self._storage is None:
            msg = "UsersService.start() must be called before use"
            raise RuntimeError(msg)
        return self._storage

    @staticmethod
    def _to_public_user(user: UserInDB) -> User:
        return User.model_validate(user.model_dump())

    async def _get_in_db_or_raise(self, user_id: str) -> UserInDB:
        user = await self._backend.get_by_id(user_id)
        if user is None:
            msg = f"User '{user_id}' not found"
            raise NotFoundError(msg)
        return user

    async def ensure_default_admin(self) -> None:
        """Create the default admin/admin user if no users exist."""
        existing = await self._backend.list_all()
        if existing:
            return
        admin = UserInDB(
            id=gen_id(),
            username="admin",
            hashed_password=hash_password("admin"),
            role=Role.ADMIN,
            must_change_password=True,
        )
        await self._backend.save(admin)

    async def get_by_username(self, username: str) -> User | None:
        user = await self._backend.get_by_username(username)
        if user is None:
            return None
        return self._to_public_user(user)

    async def get_by_id(self, user_id: str) -> User:
        user = await self._get_in_db_or_raise(user_id)
        return self._to_public_user(user)

    async def authenticate(self, username: str, password: str) -> User | None:
        user = await self._backend.get_by_username(username)
        if user is None:
            return None
        if not verify_password(password, user.hashed_password):
            return None
        if user.is_blocked:
            msg = f"User '{username}' is blocked"
            raise BlockedUserError(msg)
        return self._to_public_user(user)

    async def list_users(self) -> list[User]:
        users = await self._backend.list_all()
        return [self._to_public_user(u) for u in users]

    async def create_user(
        self,
        create_data: UserCreate,
        *,
        pre_hashed_password: str | None = None,
    ) -> User:
        existing = await self._backend.get_by_username(create_data.username)
        if existing is not None:
            msg = f"Username '{create_data.username}' already exists"
            raise ValueError(msg)
        hashed = pre_hashed_password or hash_password(create_data.password)
        user = UserInDB(
            id=gen_id(),
            username=create_data.username,
            hashed_password=hashed,
            role=create_data.role,
            type=create_data.type,
            name=create_data.name,
            email=create_data.email,
            title=create_data.title,
            must_change_password=False,
        )
        await self._backend.save(user)
        return self._to_public_user(user)

    async def update_user(
        self,
        user_id: str,
        update_data: UserUpdate,
    ) -> User:
        user = await self._get_in_db_or_raise(user_id)

        if update_data.username is not None:
            conflict = await self._backend.get_by_username(update_data.username)
            if conflict is not None and conflict.id != user_id:
                msg = f"Username '{update_data.username}' already exists"
                raise ValueError(msg)

        updated_user = user.update(update_data)
        await self._backend.save(updated_user)
        return self._to_public_user(updated_user)

    async def delete_user(self, user_id: str) -> None:
        await self._get_in_db_or_raise(user_id)
        await self._backend.delete(user_id)

    async def block_user(self, user_id: str) -> User:
        user = await self._get_in_db_or_raise(user_id)
        blocked = user.model_copy(update={"is_blocked": True})
        await self._backend.save(blocked)
        return self._to_public_user(blocked)

    async def unblock_user(self, user_id: str) -> User:
        user = await self._get_in_db_or_raise(user_id)
        unblocked = user.model_copy(update={"is_blocked": False})
        await self._backend.save(unblocked)
        return self._to_public_user(unblocked)

    async def is_blocked(self, user_id: str) -> bool:
        user = await self._backend.get_by_id(user_id)
        return user is not None and user.is_blocked


__all__ = ["UsersService"]
