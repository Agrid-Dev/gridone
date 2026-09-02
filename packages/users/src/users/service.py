import logging
import secrets

from models.errors import (
    BlockedUserError,
    InvalidError,
    NotFoundError,
    UnauthorizedError,
)
from models.ids import gen_id
from models.service import Service
from users.models import Role, User, UserCreate, UserInDB, UserUpdate
from users.password import hash_password, verify_password
from users.storage import build_users_storage
from users.storage.storage_backend import UsersStorageBackend

logger = logging.getLogger(__name__)

_GENERATED_PASSWORD_BYTES = 16


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

    async def ensure_default_admin(self) -> None:
        """Seed the admin account if no users exist.

        With no configured password one is generated, logged once, and the
        account is flagged to change it.
        """
        existing = await self._backend.list_all()
        if existing:
            return
        generated = self._admin_password is None
        password = self._admin_password or secrets.token_urlsafe(
            _GENERATED_PASSWORD_BYTES
        )
        if generated:
            logger.warning(
                "No admin password configured. Seeded the 'admin' account with "
                "a generated password: %s. It must be changed at first login.",
                password,
            )
        admin = UserInDB(
            id=gen_id(),
            username="admin",
            hashed_password=hash_password(password),
            role=Role.ADMIN,
            must_change_password=generated,
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

    async def change_password(
        self, user_id: str, current_password: str, new_password: str
    ) -> User:
        """Rotate the password after re-verifying the current one.

        The write goes through ``UserUpdate``, which clears
        ``must_change_password``.
        """
        user = await self._get_in_db_or_raise(user_id)
        if not verify_password(current_password, user.hashed_password):
            msg = f"Invalid current password for user '{user_id}'"
            raise UnauthorizedError(msg)
        if new_password == current_password:
            # Otherwise the flag clears without the credential rotating.
            msg = "The new password must differ from the current one"
            raise InvalidError(msg)
        updated_user = user.update(UserUpdate(password=new_password))
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
