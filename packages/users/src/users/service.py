from models.errors import (
    BlockedUserError,
    ConfigurationError,
    InvalidError,
    NotFoundError,
    UnauthorizedError,
)
from models.ids import gen_id
from models.service import Service
from users.models import Role, User, UserCreate, UserInDB, UserUpdate
from users.password import hash_password, verify_password
from users.roles import BUILTIN_ROLES, find_builtin_role
from users.storage import build_users_storage
from users.storage.storage_backend import UsersStorageBackend


class UsersService(Service):
    def __init__(
        self, storage_url: str | None, admin_password: str | None = None
    ) -> None:
        self._storage_url = storage_url
        self._admin_password = admin_password
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

    async def _apply_update(self, user_id: str, update: UserUpdate) -> User:
        """Partial write: only the set fields reach storage, so a concurrent
        change to any other field (e.g. a block) survives."""
        updated = await self._backend.update(user_id, update)
        if updated is None:
            msg = f"User '{user_id}' not found"
            raise NotFoundError(msg)
        return self._to_public_user(updated)

    async def ensure_default_admin(self) -> None:
        """Seed the admin account from the configured password if no users exist.

        Raises ``ConfigurationError`` rather than seeding a credential nobody
        knows: a service that boots into an account no one can log into is
        worse than one that refuses to start and says why.
        """
        existing = await self._backend.list_all()
        if existing:
            return
        if self._admin_password is None:
            msg = "No admin password configured and no users exist"
            raise ConfigurationError(msg)
        admin = UserInDB(
            id=gen_id(),
            username="admin",
            hashed_password=hash_password(self._admin_password),
            role="admin",
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

    async def list_roles(self) -> list[Role]:
        return list(BUILTIN_ROLES)

    async def get_role(self, role_id: str) -> Role:
        role = find_builtin_role(role_id)
        if role is None:
            msg = f"Role '{role_id}' not found"
            raise NotFoundError(msg)
        return role

    async def _ensure_role_exists(self, role_id: str) -> None:
        if find_builtin_role(role_id) is None:
            msg = f"Unknown role '{role_id}'"
            raise InvalidError(msg)

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
        await self._ensure_role_exists(create_data.role)
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
        # No pre-read (see _apply_update), so a taken username answers 409
        # before an unknown user_id answers 404. Both are errors; accepted.
        if update_data.username is not None:
            conflict = await self._backend.get_by_username(update_data.username)
            if conflict is not None and conflict.id != user_id:
                msg = f"Username '{update_data.username}' already exists"
                raise ValueError(msg)
        if update_data.role is not None:
            await self._ensure_role_exists(update_data.role)
        return await self._apply_update(user_id, update_data)

    async def change_password(
        self, user_id: str, current_password: str, new_password: str
    ) -> User:
        """Rotate the password after re-verifying the current one.

        ``UserUpdate`` clears ``must_change_password`` alongside the hash.
        """
        user = await self._get_in_db_or_raise(user_id)
        if not verify_password(current_password, user.hashed_password):
            msg = f"Invalid current password for user '{user_id}'"
            raise UnauthorizedError(msg)
        if new_password == current_password:
            msg = "The new password must differ from the current one"
            raise InvalidError(msg)
        return await self._apply_update(user_id, UserUpdate(password=new_password))

    async def delete_user(self, user_id: str) -> None:
        await self._get_in_db_or_raise(user_id)
        await self._backend.delete(user_id)

    async def block_user(self, user_id: str) -> User:
        return await self._apply_update(user_id, UserUpdate(is_blocked=True))

    async def unblock_user(self, user_id: str) -> User:
        return await self._apply_update(user_id, UserUpdate(is_blocked=False))

    async def is_blocked(self, user_id: str) -> bool:
        user = await self._backend.get_by_id(user_id)
        return user is not None and user.is_blocked


__all__ = ["UsersService"]
