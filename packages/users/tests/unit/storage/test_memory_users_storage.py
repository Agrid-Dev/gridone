import pytest

from users.models import UserInDB, UserUpdate
from users.storage import MemoryUsersStorage

pytestmark = pytest.mark.asyncio


def _alice(**overrides: object) -> UserInDB:
    fields: dict[str, object] = {
        "id": "u1",
        "username": "alice",
        "hashed_password": "old-hash",
        "role": "operator",
    }
    fields.update(overrides)
    return UserInDB.model_validate(fields)


class TestUpdate:
    async def test_writes_only_the_set_fields(self):
        storage = MemoryUsersStorage()
        await storage.save(_alice(name="Alice", is_blocked=True))

        updated = await storage.update("u1", UserUpdate(name="Alice B."))

        assert updated is not None
        assert updated.name == "Alice B."
        assert updated.is_blocked is True
        assert updated.hashed_password == "old-hash"  # noqa: S105

    async def test_a_password_write_clears_the_flag(self):
        storage = MemoryUsersStorage()
        await storage.save(_alice(must_change_password=True))

        updated = await storage.update("u1", UserUpdate(password="new-password"))

        assert updated is not None
        assert updated.hashed_password != "old-hash"  # noqa: S105
        assert updated.must_change_password is False

    async def test_unknown_user_returns_none(self):
        storage = MemoryUsersStorage()
        assert await storage.update("nonexistent", UserUpdate(name="x")) is None
