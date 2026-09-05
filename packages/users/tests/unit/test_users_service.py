"""Unit tests for UsersService blocking, password changes and admin seeding."""

import pytest

from models.errors import (
    BlockedUserError,
    InvalidError,
    NotFoundError,
    UnauthorizedError,
)
from users import UsersService
from users.models import Role, UserInDB
from users.password import hash_password, verify_password
from users.storage import MemoryUsersStorage

pytestmark = pytest.mark.asyncio


def _make_user(
    user_id: str = "u1",
    username: str = "alice",
    role: Role = Role.OPERATOR,
    *,
    is_blocked: bool = False,
) -> UserInDB:
    return UserInDB(
        id=user_id,
        username=username,
        hashed_password=hash_password("password12345"),
        role=role,
        is_blocked=is_blocked,
    )


@pytest.fixture
def storage() -> MemoryUsersStorage:
    return MemoryUsersStorage()


@pytest.fixture
def service(storage: MemoryUsersStorage) -> UsersService:
    svc = UsersService(storage_url=None)
    # Inject the shared storage so tests can seed UserInDB rows directly (with
    # pre-computed hashed_password) without paying bcrypt for every fixture.
    # Skipping ``start`` also keeps the default-admin seed out of assertions.
    svc._storage = storage  # noqa: SLF001
    return svc


class TestBlockUser:
    async def test_block_user(self, service: UsersService, storage: MemoryUsersStorage):
        user = _make_user()
        await storage.save(user)

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
        user = _make_user(is_blocked=True)
        await storage.save(user)

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
        user = _make_user(is_blocked=True)
        await storage.save(user)
        assert await service.is_blocked("u1") is True

    async def test_is_blocked_false(
        self, service: UsersService, storage: MemoryUsersStorage
    ):
        user = _make_user(is_blocked=False)
        await storage.save(user)
        assert await service.is_blocked("u1") is False

    async def test_is_blocked_nonexistent_returns_false(self, service: UsersService):
        assert await service.is_blocked("nonexistent") is False


class TestAuthenticateBlocked:
    async def test_authenticate_blocked_user_raises(
        self, service: UsersService, storage: MemoryUsersStorage
    ):
        user = _make_user(is_blocked=True)
        await storage.save(user)

        with pytest.raises(BlockedUserError):
            await service.authenticate("alice", "password12345")

    async def test_authenticate_unblocked_user_succeeds(
        self, service: UsersService, storage: MemoryUsersStorage
    ):
        user = _make_user(is_blocked=False)
        await storage.save(user)

        result = await service.authenticate("alice", "password12345")
        assert result is not None
        assert result.username == "alice"

    async def test_authenticate_oversized_password_returns_none(
        self, service: UsersService, storage: MemoryUsersStorage
    ):
        """Login is unauthenticated: an over-long password must not raise."""
        await storage.save(_make_user())

        assert await service.authenticate("alice", "é" * 40) is None


class TestChangePassword:
    async def test_change_password_applies_and_clears_flag(
        self, service: UsersService, storage: MemoryUsersStorage
    ):
        await storage.save(
            _make_user().model_copy(update={"must_change_password": True})
        )

        result = await service.change_password("u1", "password12345", "new-password")

        assert result.must_change_password is False
        stored = await storage.get_by_id("u1")
        assert stored is not None
        assert verify_password("new-password", stored.hashed_password)
        assert stored.must_change_password is False

    async def test_change_password_wrong_current_raises_and_keeps_the_password(
        self, service: UsersService, storage: MemoryUsersStorage
    ):
        await storage.save(_make_user())

        with pytest.raises(UnauthorizedError):
            await service.change_password("u1", "wrong-password", "new-password")

        stored = await storage.get_by_id("u1")
        assert stored is not None
        assert verify_password("password12345", stored.hashed_password)

    async def test_change_password_unknown_user_raises(self, service: UsersService):
        with pytest.raises(NotFoundError):
            await service.change_password("nope", "password12345", "new-password")

    async def test_change_password_rejects_reusing_the_current_password(
        self, service: UsersService, storage: MemoryUsersStorage
    ):
        """Otherwise the flag clears without the credential ever rotating."""
        await storage.save(
            _make_user().model_copy(update={"must_change_password": True})
        )

        with pytest.raises(InvalidError):
            await service.change_password("u1", "password12345", "password12345")

        stored = await storage.get_by_id("u1")
        assert stored is not None
        assert stored.must_change_password is True

    async def test_change_password_accepts_a_short_current_password(
        self, service: UsersService, storage: MemoryUsersStorage
    ):
        """The stored credential may predate the length rules for new ones."""
        user = _make_user().model_copy(update={"hashed_password": hash_password("abc")})
        await storage.save(user)

        result = await service.change_password("u1", "abc", "new-password")

        assert result.must_change_password is False


class TestEnsureDefaultAdmin:
    async def test_generated_password_flags_the_account(
        self, service: UsersService, storage: MemoryUsersStorage
    ):
        await service.ensure_default_admin()

        admin = await storage.get_by_username("admin")
        assert admin is not None
        assert admin.role == Role.ADMIN
        assert admin.must_change_password is True
        assert not verify_password("admin", admin.hashed_password)

    async def test_generated_password_is_logged_once(
        self,
        service: UsersService,
        storage: MemoryUsersStorage,
        caplog: pytest.LogCaptureFixture,
    ):
        with caplog.at_level("WARNING"):
            await service.ensure_default_admin()

        warnings = [r for r in caplog.records if r.levelname == "WARNING"]
        assert len(warnings) == 1
        admin = await storage.get_by_username("admin")
        assert admin is not None
        logged = warnings[0].args
        assert isinstance(logged, tuple)
        # The logged credential is the one that was actually seeded.
        assert verify_password(str(logged[0]), admin.hashed_password)

    async def test_configured_password_is_seeded_without_the_flag(
        self, storage: MemoryUsersStorage
    ):
        service = UsersService(storage_url=None, admin_password="configured-password")
        service._storage = storage  # noqa: SLF001

        await service.ensure_default_admin()

        admin = await storage.get_by_username("admin")
        assert admin is not None
        assert admin.must_change_password is False
        assert verify_password("configured-password", admin.hashed_password)

    async def test_is_a_noop_when_a_user_already_exists(
        self, service: UsersService, storage: MemoryUsersStorage
    ):
        await storage.save(_make_user())

        await service.ensure_default_admin()

        assert await storage.get_by_username("admin") is None
