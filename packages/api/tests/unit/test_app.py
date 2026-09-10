import pytest

from api.app import _start_users_service

pytestmark = pytest.mark.asyncio


class TestStartUsersService:
    async def test_seeds_the_admin_from_the_setting(self):
        service = await _start_users_service(None, "configured-password")
        try:
            users = await service.list_users()
            assert [u.username for u in users] == ["admin"]
        finally:
            await service.stop()

    async def test_names_the_env_var_when_the_seed_cannot_run(self):
        """The service speaks in its own terms; the root maps it to the setting."""
        with pytest.raises(RuntimeError, match="GRIDONE_ADMIN_PASSWORD"):
            await _start_users_service(None, None)
