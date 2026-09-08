import pytest

from users.models import Role, UserInDB
from users.storage import MemoryUsersStorage

pytestmark = pytest.mark.asyncio


class TestUpdatePassword:
    async def test_updates_password_and_clears_the_flag(self):
        storage = MemoryUsersStorage()
        await storage.save(
            UserInDB(
                id="u1",
                username="alice",
                hashed_password="old-hash",
                role=Role.OPERATOR,
                must_change_password=True,
            )
        )

        updated = await storage.update_password("u1", "new-hash")

        assert updated is not None
        assert updated.hashed_password == "new-hash"  # noqa: S105
        assert updated.must_change_password is False

    async def test_does_not_clobber_a_concurrently_written_field(self):
        """A field changed by another writer after the stale read must survive."""
        storage = MemoryUsersStorage()
        await storage.save(
            UserInDB(
                id="u1",
                username="alice",
                hashed_password="old-hash",
                role=Role.OPERATOR,
                is_blocked=False,
            )
        )

        saved = await storage.get_by_id("u1")
        assert saved is not None
        await storage.save(saved.model_copy(update={"is_blocked": True}))
        updated = await storage.update_password("u1", "new-hash")

        assert updated is not None
        assert updated.is_blocked is True
        assert updated.hashed_password == "new-hash"  # noqa: S105

    async def test_unknown_user_returns_none(self):
        storage = MemoryUsersStorage()
        assert await storage.update_password("nonexistent", "new-hash") is None
