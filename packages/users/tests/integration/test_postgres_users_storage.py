"""Integration tests for PostgresUsersStorage against a real PostgreSQL database."""

from __future__ import annotations

import os

import asyncpg
import pytest
import pytest_asyncio

from users.models import UserInDB
from users.password import hash_password
from users.storage.postgres.postgres_users_storage import PostgresUsersStorage

POSTGRES_URL = os.environ.get("POSTGRES_TEST_URL")

pytestmark = [
    pytest.mark.asyncio,
    pytest.mark.integration,
    pytest.mark.skipif(POSTGRES_URL is None, reason="POSTGRES_TEST_URL not set"),
]


# ---------------------------------------------------------------------------
# Fixture
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def storage():
    pool = await asyncpg.create_pool(POSTGRES_URL)
    store = PostgresUsersStorage(pool)
    await store.ensure_schema()

    async with pool.acquire() as conn:
        # Clean dependents first (FK references users.id)
        await conn.execute("DELETE FROM user_role_assignments")
        await conn.execute("DELETE FROM users")

    yield store

    await pool.close()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_user(
    user_id: str = "user-1",
    *,
    username: str = "alice",
    password: str = "password123",
    name: str = "",
    email: str = "",
    title: str = "",
    must_change_password: bool = False,
) -> UserInDB:
    return UserInDB(
        id=user_id,
        username=username,
        hashed_password=hash_password(password),
        name=name,
        email=email,
        title=title,
        must_change_password=must_change_password,
    )


# ===================================================================
# CRUD
# ===================================================================


class TestCRUD:
    async def test_save_and_get_by_id(self, storage: PostgresUsersStorage):
        user = _make_user()
        await storage.save(user)

        fetched = await storage.get_by_id("user-1")
        assert fetched is not None
        assert fetched.id == "user-1"
        assert fetched.username == "alice"

    async def test_get_by_id_not_found(self, storage: PostgresUsersStorage):
        assert await storage.get_by_id("nonexistent") is None

    async def test_get_by_username(self, storage: PostgresUsersStorage):
        await storage.save(_make_user())

        fetched = await storage.get_by_username("alice")
        assert fetched is not None
        assert fetched.id == "user-1"

    async def test_get_by_username_not_found(self, storage: PostgresUsersStorage):
        assert await storage.get_by_username("nobody") is None

    async def test_list_all_empty(self, storage: PostgresUsersStorage):
        assert await storage.list_all() == []

    async def test_list_all(self, storage: PostgresUsersStorage):
        await storage.save(_make_user("u1", username="alice"))
        await storage.save(_make_user("u2", username="bob"))

        users = await storage.list_all()
        assert len(users) == 2
        # Ordered by username
        assert users[0].username == "alice"
        assert users[1].username == "bob"

    async def test_save_upsert(self, storage: PostgresUsersStorage):
        user = _make_user(name="Original")
        await storage.save(user)

        updated = user.model_copy(update={"name": "Updated"})
        await storage.save(updated)

        fetched = await storage.get_by_id("user-1")
        assert fetched is not None
        assert fetched.name == "Updated"

    async def test_delete(self, storage: PostgresUsersStorage):
        await storage.save(_make_user())
        await storage.delete("user-1")

        assert await storage.get_by_id("user-1") is None

    async def test_delete_nonexistent_is_noop(self, storage: PostgresUsersStorage):
        await storage.delete("does-not-exist")


# ===================================================================
# Field preservation
# ===================================================================


class TestFieldPreservation:
    async def test_all_fields_round_trip(self, storage: PostgresUsersStorage):
        user = _make_user(
            name="Alice Smith",
            email="alice@example.com",
            title="Engineer",
            must_change_password=True,
        )
        await storage.save(user)

        fetched = await storage.get_by_id("user-1")
        assert fetched is not None
        assert fetched.name == "Alice Smith"
        assert fetched.email == "alice@example.com"
        assert fetched.title == "Engineer"
        assert fetched.must_change_password is True

    async def test_password_hash_preserved(self, storage: PostgresUsersStorage):
        user = _make_user(password="secret")
        await storage.save(user)

        fetched = await storage.get_by_id("user-1")
        assert fetched is not None
        assert fetched.hashed_password == user.hashed_password


# ===================================================================
# Constraints
# ===================================================================


class TestConstraints:
    async def test_unique_username(self, storage: PostgresUsersStorage):
        await storage.save(_make_user("u1", username="alice"))
        with pytest.raises(asyncpg.UniqueViolationError):
            await storage.save(_make_user("u2", username="alice"))
