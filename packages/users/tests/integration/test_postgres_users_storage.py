"""Integration tests for the postgres users backend.

Opt-in via ``POSTGRES_TEST_URL``; skipped when unset so the default suite stays
hermetic. Each test starts with an empty ``users`` table.
"""

import os

import pytest
import pytest_asyncio

from users.models import UserInDB, UserUpdate
from users.storage.factory import build_users_storage
from users.storage.postgres import PostgresUsersStorage

POSTGRES_URL = os.environ.get("POSTGRES_TEST_URL")

pytestmark = [
    pytest.mark.asyncio,
    pytest.mark.integration,
    pytest.mark.skipif(POSTGRES_URL is None, reason="POSTGRES_TEST_URL not set"),
]


def _alice(**overrides: object) -> UserInDB:
    fields: dict[str, object] = {
        "id": "u1",
        "username": "alice",
        "hashed_password": "old-hash",
        "role": "operator",
        "name": "Alice",
    }
    fields.update(overrides)
    return UserInDB.model_validate(fields)


@pytest_asyncio.fixture
async def storage():
    assert POSTGRES_URL is not None
    store: PostgresUsersStorage = await build_users_storage(POSTGRES_URL)  # type: ignore[assignment]
    await store._pool.execute("DELETE FROM users")  # noqa: SLF001
    yield store
    await store.close()


async def test_save_get_list_delete_round_trip(storage: PostgresUsersStorage):
    alice = _alice(is_blocked=True, must_change_password=True)
    await storage.save(alice)

    assert await storage.get_by_id("u1") == alice
    assert await storage.get_by_username("alice") == alice
    assert await storage.list_all() == [alice]

    await storage.delete("u1")
    assert await storage.get_by_id("u1") is None
    assert await storage.get_by_username("alice") is None


async def test_save_upserts_the_full_row(storage: PostgresUsersStorage):
    await storage.save(_alice())
    await storage.save(_alice(name="Alice B.", role="admin"))

    stored = await storage.get_by_id("u1")
    assert stored is not None
    assert stored.name == "Alice B."
    assert stored.role == "admin"


async def test_update_writes_only_the_set_fields(storage: PostgresUsersStorage):
    await storage.save(_alice(is_blocked=True))

    updated = await storage.update("u1", UserUpdate(name="Alice B.", title="Ops"))

    assert updated is not None
    assert (updated.name, updated.title) == ("Alice B.", "Ops")
    assert updated.is_blocked is True
    assert updated.hashed_password == "old-hash"  # noqa: S105
    assert await storage.get_by_id("u1") == updated


async def test_update_password_clears_the_flag(storage: PostgresUsersStorage):
    await storage.save(_alice(must_change_password=True))

    updated = await storage.update("u1", UserUpdate(password="new-password"))

    assert updated is not None
    assert updated.hashed_password != "old-hash"  # noqa: S105
    assert updated.must_change_password is False


async def test_update_with_nothing_set_returns_the_row(storage: PostgresUsersStorage):
    alice = _alice()
    await storage.save(alice)

    assert await storage.update("u1", UserUpdate()) == alice


async def test_update_unknown_user_returns_none(storage: PostgresUsersStorage):
    assert await storage.update("nonexistent", UserUpdate(name="x")) is None
