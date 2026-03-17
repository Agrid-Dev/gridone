"""Unit tests for UsersManager blocking functionality."""

import pytest
from models.errors import BlockedUserError, NotFoundError
from users import UsersManager
from users.models import Role, UserInDB
from users.password import hash_password

pytestmark = pytest.mark.asyncio


class InMemoryStorage:
    """Minimal in-memory storage for testing."""

    def __init__(self) -> None:
        self._users: dict[str, UserInDB] = {}

    async def get_by_id(self, user_id: str) -> UserInDB | None:
        return self._users.get(user_id)

    async def get_by_username(self, username: str) -> UserInDB | None:
        for u in self._users.values():
            if u.username == username:
                return u
        return None

    async def list_all(self) -> list[UserInDB]:
        return list(self._users.values())

    async def save(self, user: UserInDB) -> None:
        self._users[user.id] = user

    async def delete(self, user_id: str) -> None:
        self._users.pop(user_id, None)

    async def close(self) -> None:
        pass


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
def storage() -> InMemoryStorage:
    return InMemoryStorage()


@pytest.fixture
def manager(storage: InMemoryStorage) -> UsersManager:
    return UsersManager(storage)


class TestBlockUser:
    async def test_block_user(self, manager: UsersManager, storage: InMemoryStorage):
        user = _make_user()
        await storage.save(user)

        result = await manager.block_user("u1")
        assert result.is_blocked is True
        # Persisted in storage
        stored = await storage.get_by_id("u1")
        assert stored is not None
        assert stored.is_blocked is True

    async def test_block_user_not_found(self, manager: UsersManager):
        with pytest.raises(NotFoundError):
            await manager.block_user("nonexistent")


class TestUnblockUser:
    async def test_unblock_user(self, manager: UsersManager, storage: InMemoryStorage):
        user = _make_user(is_blocked=True)
        await storage.save(user)

        result = await manager.unblock_user("u1")
        assert result.is_blocked is False
        stored = await storage.get_by_id("u1")
        assert stored is not None
        assert stored.is_blocked is False

    async def test_unblock_user_not_found(self, manager: UsersManager):
        with pytest.raises(NotFoundError):
            await manager.unblock_user("nonexistent")


class TestIsBlocked:
    async def test_is_blocked_true(
        self, manager: UsersManager, storage: InMemoryStorage
    ):
        user = _make_user(is_blocked=True)
        await storage.save(user)
        assert await manager.is_blocked("u1") is True

    async def test_is_blocked_false(
        self, manager: UsersManager, storage: InMemoryStorage
    ):
        user = _make_user(is_blocked=False)
        await storage.save(user)
        assert await manager.is_blocked("u1") is False

    async def test_is_blocked_nonexistent_returns_false(self, manager: UsersManager):
        assert await manager.is_blocked("nonexistent") is False


class TestAuthenticateBlocked:
    async def test_authenticate_blocked_user_raises(
        self, manager: UsersManager, storage: InMemoryStorage
    ):
        user = _make_user(is_blocked=True)
        await storage.save(user)

        with pytest.raises(BlockedUserError):
            await manager.authenticate("alice", "password12345")

    async def test_authenticate_unblocked_user_succeeds(
        self, manager: UsersManager, storage: InMemoryStorage
    ):
        user = _make_user(is_blocked=False)
        await storage.save(user)

        result = await manager.authenticate("alice", "password12345")
        assert result is not None
        assert result.username == "alice"
