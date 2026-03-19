"""Unit tests for RegistrationRequestsManager."""

import pytest
from apps.models import RegistrationRequest, RegistrationRequestStatus
from models.errors import InvalidError, NotFoundError

from apps import RegistrationRequestCreate, RegistrationRequestsManager

pytestmark = pytest.mark.asyncio

VALID_CONFIG = (
    "name: My App\n"
    "api_url: https://example.com\n"
    "description: A test application\n"
    "icon: https://example.com/icon.png\n"
)


class InMemoryRegistrationStorage:
    """Minimal in-memory storage for registration requests."""

    def __init__(self) -> None:
        self._requests: dict[str, RegistrationRequest] = {}

    async def get_by_id(self, request_id: str) -> RegistrationRequest | None:
        return self._requests.get(request_id)

    async def list_all(self) -> list[RegistrationRequest]:
        return list(self._requests.values())

    async def save(self, request: RegistrationRequest) -> None:
        self._requests[request.id] = request

    async def close(self) -> None:
        pass


@pytest.fixture
def reg_storage() -> InMemoryRegistrationStorage:
    return InMemoryRegistrationStorage()


@pytest.fixture
def manager(reg_storage) -> RegistrationRequestsManager:
    return RegistrationRequestsManager(reg_storage)


class TestCreateRegistrationRequest:
    async def test_create_request(self, manager, reg_storage):
        req = await manager.create_registration_request(
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

    async def test_create_missing_config(self, manager):
        with pytest.raises(InvalidError, match="config is required"):
            await manager.create_registration_request(
                RegistrationRequestCreate(
                    username="myapp",
                    password="apppassword",
                    config="",
                )
            )

    async def test_create_invalid_yaml(self, manager):
        with pytest.raises(InvalidError, match="not valid YAML"):
            await manager.create_registration_request(
                RegistrationRequestCreate(
                    username="myapp",
                    password="apppassword",
                    config="[invalid: yaml: {",
                )
            )

    async def test_create_missing_required_fields(self, manager):
        with pytest.raises(InvalidError, match="missing required fields"):
            await manager.create_registration_request(
                RegistrationRequestCreate(
                    username="myapp",
                    password="apppassword",
                    config="name: only name\n",
                )
            )

    async def test_create_not_a_mapping(self, manager):
        with pytest.raises(InvalidError, match="must be a YAML mapping"):
            await manager.create_registration_request(
                RegistrationRequestCreate(
                    username="myapp",
                    password="apppassword",
                    config="- just a list\n",
                )
            )


class TestListRegistrationRequests:
    async def test_list_empty(self, manager):
        result = await manager.list_registration_requests()
        assert result == []

    async def test_list_returns_all(self, manager):
        await manager.create_registration_request(
            RegistrationRequestCreate(
                username="app1",
                password="password1",
                config=VALID_CONFIG,
            )
        )
        await manager.create_registration_request(
            RegistrationRequestCreate(
                username="app2",
                password="password2",
                config=VALID_CONFIG,
            )
        )
        result = await manager.list_registration_requests()
        assert len(result) == 2


class TestGetRegistrationRequest:
    async def test_get_existing(self, manager):
        created = await manager.create_registration_request(
            RegistrationRequestCreate(
                username="app1",
                password="password1",
                config=VALID_CONFIG,
            )
        )
        fetched = await manager.get_registration_request(created.id)
        assert fetched.id == created.id
        assert fetched.username == "app1"

    async def test_get_not_found(self, manager):
        with pytest.raises(NotFoundError):
            await manager.get_registration_request("nonexistent-id")


class TestAcceptRegistrationRequest:
    async def test_accept_updates_status(self, manager):
        req = await manager.create_registration_request(
            RegistrationRequestCreate(
                username="myapp",
                password="password123",
                config=VALID_CONFIG,
            )
        )
        accepted = await manager.accept_registration_request(req.id)

        assert accepted.status == RegistrationRequestStatus.ACCEPTED
        assert accepted.id == req.id
        assert accepted.username == req.username
        assert accepted.hashed_password == req.hashed_password
        assert accepted.config == req.config

    async def test_accept_not_found(self, manager):
        with pytest.raises(NotFoundError):
            await manager.accept_registration_request("nonexistent-id")

    async def test_accept_already_accepted(self, manager):
        req = await manager.create_registration_request(
            RegistrationRequestCreate(
                username="app1",
                password="password1",
                config=VALID_CONFIG,
            )
        )
        await manager.accept_registration_request(req.id)
        with pytest.raises(InvalidError, match="not pending"):
            await manager.accept_registration_request(req.id)

    async def test_accept_already_discarded(self, manager):
        req = await manager.create_registration_request(
            RegistrationRequestCreate(
                username="app1",
                password="password1",
                config=VALID_CONFIG,
            )
        )
        await manager.discard_registration_request(req.id)
        with pytest.raises(InvalidError, match="not pending"):
            await manager.accept_registration_request(req.id)


class TestDiscardRegistrationRequest:
    async def test_discard(self, manager):
        req = await manager.create_registration_request(
            RegistrationRequestCreate(
                username="app1",
                password="password1",
                config=VALID_CONFIG,
            )
        )
        discarded = await manager.discard_registration_request(req.id)
        assert discarded.status == RegistrationRequestStatus.DISCARDED

    async def test_discard_not_found(self, manager):
        with pytest.raises(NotFoundError):
            await manager.discard_registration_request("nonexistent-id")

    async def test_discard_already_accepted(self, manager):
        req = await manager.create_registration_request(
            RegistrationRequestCreate(
                username="app1",
                password="password1",
                config=VALID_CONFIG,
            )
        )
        await manager.accept_registration_request(req.id)
        with pytest.raises(InvalidError, match="not pending"):
            await manager.discard_registration_request(req.id)

    async def test_discard_already_discarded(self, manager):
        req = await manager.create_registration_request(
            RegistrationRequestCreate(
                username="app1",
                password="password1",
                config=VALID_CONFIG,
            )
        )
        await manager.discard_registration_request(req.id)
        with pytest.raises(InvalidError, match="not pending"):
            await manager.discard_registration_request(req.id)


class TestRegistrationRequestsManagerLifecycle:
    async def test_close_shuts_down_without_error(self, reg_storage):
        manager = RegistrationRequestsManager(reg_storage)
        await manager.close()

    async def test_from_storage_rejects_non_postgres(self):
        with pytest.raises(ValueError, match="requires PostgreSQL"):
            await RegistrationRequestsManager.from_storage("/data/not-postgres")
