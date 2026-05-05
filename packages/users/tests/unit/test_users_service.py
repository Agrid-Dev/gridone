"""Unit tests for UsersService blocking functionality."""

import pytest

from models.errors import BlockedUserError, NotFoundError
from users import UsersService
from users.models import Role, UserInDB
from users.password import hash_password
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
