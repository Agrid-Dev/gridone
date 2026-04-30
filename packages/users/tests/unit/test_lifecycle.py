"""Lifecycle tests for UsersService — start/stop and storage URL handling."""

from unittest.mock import patch

import pytest

from models.errors import StorageConnectionError, UnsupportedStorageError
from users import UsersService
from users.models import Role
from users.storage import MemoryUsersStorage

pytestmark = pytest.mark.asyncio


class TestStartStop:
    async def test_start_with_none_url_uses_memory_backend(self):
        svc = UsersService(storage_url=None)
        await svc.start()
        try:
            users = await svc.list_users()
            # ``ensure_default_admin`` should have seeded the default admin.
            assert len(users) == 1
            assert users[0].username == "admin"
            assert users[0].role == Role.ADMIN
            assert users[0].must_change_password is True
        finally:
            await svc.stop()

    async def test_start_then_stop_then_stop_is_idempotent(self):
        svc = UsersService(storage_url=None)
        await svc.start()
        await svc.stop()
        # Second stop must not raise (e.g. AttributeError on a missing pool).
        await svc.stop()

    async def test_stop_without_start_is_idempotent(self):
        svc = UsersService(storage_url=None)
        await svc.stop()


class TestStorageURL:
    async def test_unknown_scheme_raises_unsupported(self):
        svc = UsersService(storage_url="redis://localhost")
        with pytest.raises(UnsupportedStorageError):
            await svc.start()

    async def test_postgres_unreachable_raises_connection_error(self):
        # Patch ``run_migrations`` at its source — the factory imports it lazily
        # inside the postgres branch, so patching the source module is what
        # actually intercepts the call.
        with patch(
            "users.storage.postgres.run_migrations",
            side_effect=OSError("boom"),
        ):
            svc = UsersService(
                storage_url="postgresql://nobody:nobody@127.0.0.1:1/none"
            )
            with pytest.raises(StorageConnectionError):
                await svc.start()


class TestMemoryBackend:
    async def test_memory_storage_satisfies_protocol(self):
        # Sanity check — the new memory backend must be usable directly.
        storage = MemoryUsersStorage()
        users = await storage.list_all()
        assert users == []
        await storage.close()
