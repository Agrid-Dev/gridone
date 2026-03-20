"""Unit tests for RegistrationService: create, list, get, accept, discard."""

import pytest
from apps.registration_service import RegistrationService
from conftest import VALID_CONFIG
from models.errors import InvalidError, NotFoundError
from users.models import User, UserType

from apps import RegistrationRequestCreate, RegistrationRequestStatus

pytestmark = pytest.mark.asyncio


@pytest.fixture
def registration_service(
    reg_storage, app_storage, users_manager
) -> RegistrationService:
    return RegistrationService(reg_storage, app_storage, users_manager)


class TestCreateRegistrationRequest:
    async def test_create_request(self, registration_service, reg_storage):
        req = await registration_service.create_registration_request(
            RegistrationRequestCreate(
                username="myapp",
                password="securepassword",
                config=VALID_CONFIG,
            )
        )
        assert req.username == "myapp"
        assert req.status == RegistrationRequestStatus.PENDING
        assert req.hashed_password != "securepassword"  # noqa: S105
        assert req.config == VALID_CONFIG
        stored = await reg_storage.get_by_id(req.id)
        assert stored is not None

    async def test_create_missing_config(self, registration_service):
        with pytest.raises(InvalidError, match="config is required"):
            await registration_service.create_registration_request(
                RegistrationRequestCreate(
                    username="myapp",
                    password="apppassword",
                    config="",
                )
            )

    async def test_create_invalid_yaml(self, registration_service):
        with pytest.raises(InvalidError, match="not valid YAML"):
            await registration_service.create_registration_request(
                RegistrationRequestCreate(
                    username="myapp",
                    password="apppassword",
                    config="[invalid: yaml: {",
                )
            )

    async def test_create_missing_required_fields(self, registration_service):
        with pytest.raises(InvalidError, match="missing required fields"):
            await registration_service.create_registration_request(
                RegistrationRequestCreate(
                    username="myapp",
                    password="apppassword",
                    config="name: only name\n",
                )
            )

    async def test_create_not_a_mapping(self, registration_service):
        with pytest.raises(InvalidError, match="must be a YAML mapping"):
            await registration_service.create_registration_request(
                RegistrationRequestCreate(
                    username="myapp",
                    password="apppassword",
                    config="- just a list\n",
                )
            )


class TestListRegistrationRequests:
    async def test_list_empty(self, registration_service):
        result = await registration_service.list_registration_requests()
        assert result == []

    async def test_list_returns_all(self, registration_service):
        await registration_service.create_registration_request(
            RegistrationRequestCreate(
                username="app1",
                password="password1",
                config=VALID_CONFIG,
            )
        )
        await registration_service.create_registration_request(
            RegistrationRequestCreate(
                username="app2",
                password="password2",
                config=VALID_CONFIG,
            )
        )
        result = await registration_service.list_registration_requests()
        assert len(result) == 2


class TestGetRegistrationRequest:
    async def test_get_existing(self, registration_service):
        created = await registration_service.create_registration_request(
            RegistrationRequestCreate(
                username="app1",
                password="password1",
                config=VALID_CONFIG,
            )
        )
        fetched = await registration_service.get_registration_request(created.id)
        assert fetched.id == created.id
        assert fetched.username == "app1"

    async def test_get_not_found(self, registration_service):
        with pytest.raises(NotFoundError):
            await registration_service.get_registration_request("nonexistent-id")


class TestAcceptRegistrationRequest:
    async def test_accept_creates_service_account_and_app(
        self, registration_service, app_storage, users_manager
    ):
        users_manager.create_user.return_value = User(
            id="new-id",
            username="myapp",
            type=UserType.SERVICE_ACCOUNT,
        )
        req = await registration_service.create_registration_request(
            RegistrationRequestCreate(
                username="myapp",
                password="password123",
                config=VALID_CONFIG,
            )
        )

        accepted, user, app = await registration_service.accept_registration_request(
            req.id
        )

        assert accepted.status == RegistrationRequestStatus.ACCEPTED
        assert user.username == "myapp"
        assert user.type == UserType.SERVICE_ACCOUNT
        assert app.user_id == "new-id"
        assert app.name == "My App"
        assert app.description == "A test application"
        assert app.api_url == "https://example.com"
        assert app.icon == "https://example.com/icon.png"
        assert app.health_url == "https://example.com/health"
        assert app.manifest == VALID_CONFIG

        stored = await app_storage.get_by_id(app.id)
        assert stored is not None

        users_manager.create_user.assert_called_once()
        call_args = users_manager.create_user.call_args
        assert call_args.args[0].username == "myapp"
        assert call_args.args[0].type == UserType.SERVICE_ACCOUNT
        assert call_args.kwargs["pre_hashed_password"] == req.hashed_password

    async def test_accept_not_found(self, registration_service):
        with pytest.raises(NotFoundError):
            await registration_service.accept_registration_request("nonexistent-id")

    async def test_accept_already_accepted(self, registration_service):
        req = await registration_service.create_registration_request(
            RegistrationRequestCreate(
                username="app1",
                password="password1",
                config=VALID_CONFIG,
            )
        )
        await registration_service.accept_registration_request(req.id)
        with pytest.raises(InvalidError, match="not pending"):
            await registration_service.accept_registration_request(req.id)

    async def test_accept_already_discarded(self, registration_service):
        req = await registration_service.create_registration_request(
            RegistrationRequestCreate(
                username="app1",
                password="password1",
                config=VALID_CONFIG,
            )
        )
        await registration_service.discard_registration_request(req.id)
        with pytest.raises(InvalidError, match="not pending"):
            await registration_service.accept_registration_request(req.id)

    async def test_accept_duplicate_username(self, registration_service, users_manager):
        users_manager.create_user.side_effect = ValueError("already exists")

        req = await registration_service.create_registration_request(
            RegistrationRequestCreate(
                username="taken",
                password="password1",
                config=VALID_CONFIG,
            )
        )
        with pytest.raises(ValueError, match="already exists"):
            await registration_service.accept_registration_request(req.id)


class TestDiscardRegistrationRequest:
    async def test_discard(self, registration_service):
        req = await registration_service.create_registration_request(
            RegistrationRequestCreate(
                username="app1",
                password="password1",
                config=VALID_CONFIG,
            )
        )
        discarded = await registration_service.discard_registration_request(req.id)
        assert discarded.status == RegistrationRequestStatus.DISCARDED

    async def test_discard_not_found(self, registration_service):
        with pytest.raises(NotFoundError):
            await registration_service.discard_registration_request("nonexistent-id")

    async def test_discard_already_accepted(self, registration_service):
        req = await registration_service.create_registration_request(
            RegistrationRequestCreate(
                username="app1",
                password="password1",
                config=VALID_CONFIG,
            )
        )
        await registration_service.accept_registration_request(req.id)
        with pytest.raises(InvalidError, match="not pending"):
            await registration_service.discard_registration_request(req.id)

    async def test_discard_already_discarded(self, registration_service):
        req = await registration_service.create_registration_request(
            RegistrationRequestCreate(
                username="app1",
                password="password1",
                config=VALID_CONFIG,
            )
        )
        await registration_service.discard_registration_request(req.id)
        with pytest.raises(InvalidError, match="not pending"):
            await registration_service.discard_registration_request(req.id)
