from collections.abc import Callable

from pydantic import ValidationError

from models.errors import (
    BlockedUserError,
    ConfigurationError,
    ConflictError,
    InvalidError,
    NotFoundError,
    SchemaValidationError,
    UnauthorizedError,
    validation_error_items,
)
from models.ids import gen_id
from models.service import Service
from users.models import User, UserCreate, UserInDB, UserUpdate
from users.password import hash_password, verify_password
from users.permissions import Permission
from users.roles import BUILTIN_ROLES, Role, RoleCreate, RoleUpdate, find_builtin_role
from users.storage import UsersStorages, build_users_storage
from users.storage.roles_backend import RolesStorageBackend
from users.storage.users_backend import UsersStorageBackend


class UsersService(Service):
    """Identity and access: users on one side, roles on the other.

    The two meet in exactly two places, both here: a user must reference an
    existing role, and a role referenced by a user cannot be deleted.
    """

    def __init__(
        self, storage_url: str | None, admin_password: str | None = None
    ) -> None:
        self._storage_url = storage_url
        self._admin_password = admin_password
        self._storages: UsersStorages | None = None
        # Custom roles by id, loaded on first use and dropped on every write.
        # Permission checks run on every request; the roles table changes
        # a few times in the life of a deployment.
        self._roles_cache: dict[str, Role] | None = None

    async def start(self) -> None:
        self._storages = await build_users_storage(self._storage_url)
        await self.ensure_default_admin()

    async def stop(self) -> None:
        if self._storages is not None:
            await self._storages.close()
            self._storages = None
        self._roles_cache = None

    @property
    def _backend(self) -> UsersStorageBackend:
        if self._storages is None:
            msg = "UsersService.start() must be called before use"
            raise RuntimeError(msg)
        return self._storages.users

    @property
    def _roles_backend(self) -> RolesStorageBackend:
        if self._storages is None:
            msg = "UsersService.start() must be called before use"
            raise RuntimeError(msg)
        return self._storages.roles

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

    # --- Users ---------------------------------------------------------------

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

    async def _ensure_role_exists(self, role_id: str) -> None:
        if await self.find_role(role_id) is None:
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

    # --- Roles ---------------------------------------------------------------

    async def _custom_roles(self) -> dict[str, Role]:
        if self._roles_cache is None:
            roles = await self._roles_backend.list_all()
            self._roles_cache = {role.id: role for role in roles}
        return self._roles_cache

    def _forget_roles(self) -> None:
        self._roles_cache = None

    async def find_role(self, role_id: str) -> Role | None:
        """The role document behind an id; ``None`` once the role is gone."""
        builtin = find_builtin_role(role_id)
        if builtin is not None:
            return builtin
        return (await self._custom_roles()).get(role_id)

    @staticmethod
    def _validated[T](build: Callable[[], T]) -> T:
        """Run a role document build; its scope rules answer as a 422."""
        try:
            return build()
        except ValidationError as exc:
            raise SchemaValidationError(validation_error_items(exc)) from exc

    @staticmethod
    def _refuse_builtin(role_id: str) -> None:
        if find_builtin_role(role_id) is not None:
            msg = f"Role '{role_id}' is built-in"
            raise ConflictError(msg)

    async def list_roles(self) -> list[Role]:
        custom = await self._custom_roles()
        return [*BUILTIN_ROLES, *custom.values()]

    async def get_role(self, role_id: str) -> Role:
        role = await self.find_role(role_id)
        if role is None:
            msg = f"Role '{role_id}' not found"
            raise NotFoundError(msg)
        return role

    async def get_role_permissions(self, role_id: str) -> list[Permission]:
        """The permissions a role grants; none for a role that no longer exists."""
        role = await self.find_role(role_id)
        return list(role.permissions) if role is not None else []

    async def create_role(self, create_data: RoleCreate) -> Role:
        # Built-ins are not rows, so they need a check of their own; a taken
        # custom id is the store's call (its primary key), never a pre-read.
        self._refuse_builtin(create_data.id)
        role = self._validated(create_data.to_role)
        await self._roles_backend.insert(role)
        self._forget_roles()
        return role

    async def update_role(self, role_id: str, update_data: RoleUpdate) -> Role:
        self._refuse_builtin(role_id)
        # A partial edit is only valid against the stored document: dropping
        # a permission whose scope stays behind must fail before the write.
        current = await self.get_role(role_id)
        self._validated(lambda: update_data.apply_to(current))
        updated = await self._roles_backend.update(role_id, update_data)
        if updated is None:
            msg = f"Role '{role_id}' not found"
            raise NotFoundError(msg)
        self._forget_roles()
        return updated

    async def delete_role(self, role_id: str) -> None:
        self._refuse_builtin(role_id)
        await self.get_role(role_id)
        # A user assigned between this check and the delete ends up with a
        # role that resolves to no permissions: one request wide, and the
        # documented outcome for a dangling role.
        if await self._backend.any_with_role(role_id):
            msg = f"Role '{role_id}' is assigned to at least one user"
            raise ConflictError(msg)
        await self._roles_backend.delete(role_id)
        self._forget_roles()


__all__ = ["UsersService"]
