"""Unit tests for AppsService lifecycle and flat public surface."""

from unittest.mock import AsyncMock

import pytest
import pytest_asyncio
from conftest import VALID_CONFIG

from apps.models import AppStatus, RegistrationRequestCreate
from apps.service import AppsService
from models.errors import (
    NotFoundError,
    StorageConnectionError,
    UnsupportedStorageError,
)
from models.service import Service
from users.models import User, UserType

pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def started_service(users_manager: AsyncMock):
    service = AppsService(storage_url=None, users_service=users_manager)
    await service.start()
    yield service
    await service.stop()


class TestAppsServiceProtocol:
    async def test_satisfies_service_protocol(self, users_manager):
        service = AppsService(storage_url=None, users_service=users_manager)
        assert isinstance(service, Service)


class TestAppsServiceLifecycle:
    async def test_start_stop_in_memory_mode(self, users_manager):
        service = AppsService(storage_url=None, users_service=users_manager)
        await service.start()
        # Health-check task started inside start.
        assert service._apps_manager._health_task is not None
        await service.stop()
        # Stop is idempotent.
        await service.stop()

    async def test_start_unsupported_url_scheme(self, users_manager):
        service = AppsService(storage_url="redis://nope", users_service=users_manager)
        with pytest.raises(UnsupportedStorageError):
            await service.start()

    async def test_start_postgres_failure_wrapped(self, users_manager, monkeypatch):
        async def fake_postgres_build(_url: str):  # noqa: ANN202
            msg = "boom"
            raise RuntimeError(msg)

        monkeypatch.setattr("apps.storage.postgres.build", fake_postgres_build)

        service = AppsService(
            storage_url="postgresql://nope", users_service=users_manager
        )
        with pytest.raises(StorageConnectionError):
            await service.start()


class TestAppsCRUD:
    async def test_list_apps_empty(self, started_service):
        assert await started_service.list_apps() == []

    async def test_create_then_list(self, started_service, users_manager):
        users_manager.create_user.return_value = User(
            id="u1", username="myapp", type=UserType.SERVICE_ACCOUNT
        )
        req = await started_service.create_registration_request(
            RegistrationRequestCreate(
                username="myapp", password="password123", config=VALID_CONFIG
            )
        )
        await started_service.accept_registration_request(req.id)
        apps = await started_service.list_apps()
        assert len(apps) == 1
        assert apps[0].name == "My App"
        assert apps[0].status == AppStatus.REGISTERED

    async def test_get_app_not_found(self, started_service):
        with pytest.raises(NotFoundError):
            await started_service.get_app("nonexistent")


class TestRegistrationFlow:
    async def test_create_list_get_discard(self, started_service):
        req = await started_service.create_registration_request(
            RegistrationRequestCreate(
                username="myapp", password="password123", config=VALID_CONFIG
            )
        )

        listed = await started_service.list_registration_requests()
        assert len(listed) == 1
        assert listed[0].id == req.id

        fetched = await started_service.get_registration_request(req.id)
        assert fetched.id == req.id

        discarded = await started_service.discard_registration_request(req.id)
        assert discarded.status == "discarded"

    async def test_accept_creates_user_and_app(self, started_service, users_manager):
        users_manager.create_user.return_value = User(
            id="u1", username="myapp", type=UserType.SERVICE_ACCOUNT
        )
        req = await started_service.create_registration_request(
            RegistrationRequestCreate(
                username="myapp", password="password123", config=VALID_CONFIG
            )
        )
        accepted, user, app = await started_service.accept_registration_request(req.id)
        assert accepted.status == "accepted"
        assert user.username == "myapp"
        assert app.name == "My App"
        assert app.user_id == "u1"
