"""Unit tests for UsersService blocking, password changes and admin seeding.

The storage factory is the seam: ``start`` builds the backends through
``build_users_storage``, so the tests hand it memory backends they keep a
handle on. Rows are seeded through the public ``MemoryUsersStorage`` API with
a pre-computed hash, which keeps bcrypt out of every fixture.
"""

from collections.abc import AsyncIterator

import pytest
import pytest_asyncio

from models.errors import (
    BlockedUserError,
    ConfigurationError,
    InvalidError,
    NotFoundError,
    UnauthorizedError,
)
from users import UsersService
from users.models import UserCreate, UserInDB, UserUpdate
from users.password import hash_password, verify_password
from users.storage import MemoryRolesStorage, MemoryUsersStorage, UsersStorages

pytestmark = pytest.mark.asyncio

PASSWORD = "password12345"  # noqa: S105
PASSWORD_HASH = hash_password(PASSWORD)


def _make_user(
    user_id: str = "u1",
    username: str = "alice",
    role: str = "operator",
    *,
    is_blocked: bool = False,
) -> UserInDB:
    return UserInDB(
        id=user_id,
        username=username,
        hashed_password=PASSWORD_HASH,
        role=role,
        is_blocked=is_blocked,
    )


@pytest.fixture
def storage() -> MemoryUsersStorage:
    return MemoryUsersStorage()


@pytest.fixture
def factory(storage: MemoryUsersStorage, monkeypatch: pytest.MonkeyPatch) -> None:
    """Route the service's storage factory to the test's memory backends."""
    storages = UsersStorages(users=storage, roles=MemoryRolesStorage())

    async def build(_url: str | None) -> UsersStorages:
        return storages

    monkeypatch.setattr("users.service.build_users_storage", build)


@pytest_asyncio.fixture
async def service(
    factory: None,  # noqa: ARG001
    storage: MemoryUsersStorage,
) -> AsyncIterator[UsersService]:
    # A user exists before start, so the default-admin seed stays out of
    # every assertion below; TestEnsureDefaultAdmin starts its own services.
    await storage.save(_make_user())
    svc = UsersService(storage_url=None)
    await svc.start()
    yield svc
    await svc.stop()


class TestBlockUser:
    async def test_block_user(self, service: UsersService, storage: MemoryUsersStorage):
        result = await service.block_user("u1")

        assert result.is_blocked is True
        stored = await storage.get_by_id("u1")
        assert stored is not None
        assert stored.is_blocked is True

    async def test_block_user_not_found(self, service: UsersService):
        with pytest.raises(NotFoundError):
            await service.block_user("nonexistent")


class TestUnblockUser:
    async def test_unblock_user(
        self, service: UsersService, storage: MemoryUsersStorage
    ):
        await storage.save(_make_user(is_blocked=True))

        result = await service.unblock_user("u1")

        assert result.is_blocked is False
        stored = await storage.get_by_id("u1")
        assert stored is not None
        assert stored.is_blocked is False

    async def test_unblock_user_not_found(self, service: UsersService):
        with pytest.raises(NotFoundError):
            await service.unblock_user("nonexistent")


class TestIsBlocked:
    async def test_is_blocked_true(
        self, service: UsersService, storage: MemoryUsersStorage
    ):
        await storage.save(_make_user(is_blocked=True))
        assert await service.is_blocked("u1") is True

    async def test_is_blocked_false(self, service: UsersService):
        assert await service.is_blocked("u1") is False

    async def test_is_blocked_nonexistent_returns_false(self, service: UsersService):
        assert await service.is_blocked("nonexistent") is False


class TestAuthenticateBlocked:
    async def test_authenticate_blocked_user_raises(
        self, service: UsersService, storage: MemoryUsersStorage
    ):
        await storage.save(_make_user(is_blocked=True))

        with pytest.raises(BlockedUserError):
            await service.authenticate("alice", PASSWORD)

    async def test_authenticate_unblocked_user_succeeds(self, service: UsersService):
        result = await service.authenticate("alice", PASSWORD)

        assert result is not None
        assert result.username == "alice"

    async def test_authenticate_oversized_password_returns_none(
        self, service: UsersService
    ):
        """Login is unauthenticated: an over-long password must not raise."""
        assert await service.authenticate("alice", "é" * 40) is None


class TestChangePassword:
    async def test_change_password_applies_and_clears_flag(
        self, service: UsersService, storage: MemoryUsersStorage
    ):
        await storage.save(
            _make_user().model_copy(update={"must_change_password": True})
        )

        result = await service.change_password("u1", PASSWORD, "new-password")

        assert result.must_change_password is False
        stored = await storage.get_by_id("u1")
        assert stored is not None
        assert verify_password("new-password", stored.hashed_password)
        assert stored.must_change_password is False

    async def test_change_password_wrong_current_raises_and_keeps_the_password(
        self, service: UsersService, storage: MemoryUsersStorage
    ):
        with pytest.raises(UnauthorizedError):
            await service.change_password("u1", "wrong-password", "new-password")

        stored = await storage.get_by_id("u1")
        assert stored is not None
        assert stored.hashed_password == PASSWORD_HASH

    async def test_change_password_unknown_user_raises(self, service: UsersService):
        with pytest.raises(NotFoundError):
            await service.change_password("nope", PASSWORD, "new-password")

    async def test_change_password_rejects_reusing_the_current_password(
        self, service: UsersService, storage: MemoryUsersStorage
    ):
        """Otherwise the flag clears without the credential ever rotating."""
        await storage.save(
            _make_user().model_copy(update={"must_change_password": True})
        )

        with pytest.raises(InvalidError):
            await service.change_password("u1", PASSWORD, PASSWORD)

        stored = await storage.get_by_id("u1")
        assert stored is not None
        assert stored.must_change_password is True

    async def test_change_password_accepts_a_short_current_password(
        self, service: UsersService, storage: MemoryUsersStorage
    ):
        """The stored credential may predate the length rules for new ones."""
        await storage.save(
            _make_user().model_copy(update={"hashed_password": hash_password("abc")})
        )

        result = await service.change_password("u1", "abc", "new-password")

        assert result.must_change_password is False


@pytest.mark.usefixtures("factory")
class TestEnsureDefaultAdmin:
    async def test_no_users_and_no_configured_password_raises(
        self, storage: MemoryUsersStorage
    ):
        """Fail fast rather than boot into a box nobody can log into."""
        with pytest.raises(ConfigurationError):
            await UsersService(storage_url=None).start()

        assert await storage.get_by_username("admin") is None

    async def test_configured_password_is_seeded_without_the_flag(
        self, storage: MemoryUsersStorage
    ):
        service = UsersService(storage_url=None, admin_password="configured-password")
        await service.start()

        admin = await storage.get_by_username("admin")
        assert admin is not None
        assert admin.role == "admin"
        assert admin.must_change_password is False
        assert verify_password("configured-password", admin.hashed_password)
        await service.stop()

    async def test_is_a_noop_when_a_user_already_exists(
        self, storage: MemoryUsersStorage
    ):
        await storage.save(_make_user())
        service = UsersService(storage_url=None, admin_password="configured-password")

        await service.start()

        assert await storage.get_by_username("admin") is None
        await service.stop()


class TestConcurrentWrites:
    """A block that lands between a method's read and its write must survive.

    ``block_after_read`` blocks the account the moment the method under test
    has read it, which is the interleaving a full-row save would revert.
    """

    @pytest.fixture
    def block_after_read(self, storage: MemoryUsersStorage):
        original = storage.get_by_id

        async def get_then_block(user_id: str) -> UserInDB | None:
            user = await original(user_id)
            if user is not None:
                await storage.save(user.model_copy(update={"is_blocked": True}))
            return user

        storage.get_by_id = get_then_block  # type: ignore[method-assign]

    @pytest.mark.usefixtures("block_after_read")
    async def test_change_password_keeps_a_concurrent_block(
        self, service: UsersService, storage: MemoryUsersStorage
    ):
        result = await service.change_password("u1", PASSWORD, "new-password")

        assert result.is_blocked is True
        stored = await storage.get_by_id("u1")
        assert stored is not None
        assert stored.is_blocked is True
        assert verify_password("new-password", stored.hashed_password)

    async def test_update_user_writes_only_the_given_fields(
        self, service: UsersService, storage: MemoryUsersStorage
    ):
        await storage.save(_make_user(is_blocked=True))

        result = await service.update_user("u1", UserUpdate(name="Alice B."))

        assert result.name == "Alice B."
        assert result.is_blocked is True

    async def test_update_user_unknown_user_raises(self, service: UsersService):
        with pytest.raises(NotFoundError):
            await service.update_user("nope", UserUpdate(name="x"))

    async def test_update_user_rejects_a_taken_username(
        self, service: UsersService, storage: MemoryUsersStorage
    ):
        await storage.save(_make_user(user_id="u2", username="bob"))

        with pytest.raises(ValueError, match="already exists"):
            await service.update_user("u2", UserUpdate(username="alice"))

    async def test_update_user_keeps_its_own_username(self, service: UsersService):
        result = await service.update_user("u1", UserUpdate(username="alice"))

        assert result.username == "alice"


class TestRoles:
    async def test_list_roles_serves_the_builtins(self, service: UsersService):
        roles = await service.list_roles()
        assert [role.id for role in roles] == ["admin", "operator", "viewer"]
        assert all(role.builtin for role in roles)

    async def test_get_role_unknown_raises(self, service: UsersService):
        with pytest.raises(NotFoundError):
            await service.get_role("ghost")

    async def test_create_user_rejects_an_unknown_role(self, service: UsersService):
        with pytest.raises(InvalidError, match="ghost"):
            await service.create_user(
                UserCreate(username="dina", password=PASSWORD, role="ghost")
            )

    async def test_create_user_accepts_a_builtin_role(self, service: UsersService):
        user = await service.create_user(
            UserCreate(username="dina", password=PASSWORD, role="viewer")
        )
        assert user.role == "viewer"

    async def test_update_user_rejects_an_unknown_role(
        self, service: UsersService, storage: MemoryUsersStorage
    ):
        with pytest.raises(InvalidError, match="ghost"):
            await service.update_user("u1", UserUpdate(role="ghost"))
        stored = await storage.get_by_id("u1")
        assert stored is not None
        assert stored.role == "operator"
