"""Unit tests for AppsManager registration request functionality."""

import pytest
from apps.models import RegistrationRequest
from models.errors import InvalidError, NotFoundError
from users import UsersManager
from users.models import Role, UserInDB, UserType
from users.password import hash_password

from apps import (
    AppsManager,
    RegistrationRequestCreate,
    RegistrationRequestStatus,
    RegistrationRequestType,
)

pytestmark = pytest.mark.asyncio


# ── In-memory storage doubles ────────────────────────────────────────────


class InMemoryRegistrationStorage:
    """Minimal in-memory storage for testing."""

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


class InMemoryUsersStorage:
    """Minimal in-memory user storage for testing accept flow."""

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


# ── Fixtures ─────────────────────────────────────────────────────────────


@pytest.fixture
def reg_storage() -> InMemoryRegistrationStorage:
    return InMemoryRegistrationStorage()


@pytest.fixture
def apps_manager(reg_storage) -> AppsManager:
    return AppsManager(reg_storage)


@pytest.fixture
def users_storage() -> InMemoryUsersStorage:
    return InMemoryUsersStorage()


@pytest.fixture
def users_manager(users_storage) -> UsersManager:
    return UsersManager(users_storage)


# ── Tests ────────────────────────────────────────────────────────────────


class TestCreateRegistrationRequest:
    async def test_create_user_request(self, apps_manager, reg_storage):
        req = await apps_manager.create_registration_request(
            RegistrationRequestCreate(
                username="newuser",
                password="securepassword",
            )
        )
        assert req.username == "newuser"
        assert req.status == RegistrationRequestStatus.PENDING
        assert req.type == RegistrationRequestType.USER
        assert req.hashed_password != "securepassword"  # noqa: S105
        # Persisted
        stored = await reg_storage.get_by_id(req.id)
        assert stored is not None

    async def test_create_service_account_request(self, apps_manager):
        config = "name: My App\napi_url: https://example.com\n"
        req = await apps_manager.create_registration_request(
            RegistrationRequestCreate(
                username="myapp",
                password="apppassword",
                type=RegistrationRequestType.SERVICE_ACCOUNT,
                config=config,
            )
        )
        assert req.type == RegistrationRequestType.SERVICE_ACCOUNT
        assert req.config == config

    async def test_create_service_account_missing_config(self, apps_manager):
        with pytest.raises(InvalidError, match="config is required"):
            await apps_manager.create_registration_request(
                RegistrationRequestCreate(
                    username="myapp",
                    password="apppassword",
                    type=RegistrationRequestType.SERVICE_ACCOUNT,
                    config="",
                )
            )

    async def test_create_service_account_invalid_yaml(self, apps_manager):
        with pytest.raises(InvalidError, match="not valid YAML"):
            await apps_manager.create_registration_request(
                RegistrationRequestCreate(
                    username="myapp",
                    password="apppassword",
                    type=RegistrationRequestType.SERVICE_ACCOUNT,
                    config="[invalid: yaml: {",
                )
            )

    async def test_create_service_account_missing_required_fields(self, apps_manager):
        with pytest.raises(InvalidError, match="missing required fields"):
            await apps_manager.create_registration_request(
                RegistrationRequestCreate(
                    username="myapp",
                    password="apppassword",
                    type=RegistrationRequestType.SERVICE_ACCOUNT,
                    config="description: no name or api_url\n",
                )
            )

    async def test_create_service_account_not_a_mapping(self, apps_manager):
        with pytest.raises(InvalidError, match="must be a YAML mapping"):
            await apps_manager.create_registration_request(
                RegistrationRequestCreate(
                    username="myapp",
                    password="apppassword",
                    type=RegistrationRequestType.SERVICE_ACCOUNT,
                    config="- just a list\n",
                )
            )


class TestListRegistrationRequests:
    async def test_list_empty(self, apps_manager):
        result = await apps_manager.list_registration_requests()
        assert result == []

    async def test_list_returns_all(self, apps_manager):
        await apps_manager.create_registration_request(
            RegistrationRequestCreate(username="user1", password="password1")
        )
        await apps_manager.create_registration_request(
            RegistrationRequestCreate(username="user2", password="password2")
        )
        result = await apps_manager.list_registration_requests()
        assert len(result) == 2


class TestGetRegistrationRequest:
    async def test_get_existing(self, apps_manager):
        created = await apps_manager.create_registration_request(
            RegistrationRequestCreate(username="user1", password="password1")
        )
        fetched = await apps_manager.get_registration_request(created.id)
        assert fetched.id == created.id
        assert fetched.username == "user1"

    async def test_get_not_found(self, apps_manager):
        with pytest.raises(NotFoundError):
            await apps_manager.get_registration_request("nonexistent-id")


class TestAcceptRegistrationRequest:
    async def test_accept_creates_user(
        self, apps_manager, users_manager, users_storage
    ):
        req = await apps_manager.create_registration_request(
            RegistrationRequestCreate(username="newuser", password="password123")
        )
        accepted, user = await apps_manager.accept_registration_request(
            req.id, users_manager
        )
        assert accepted.status == RegistrationRequestStatus.ACCEPTED
        assert user.username == "newuser"
        assert user.type == UserType.USER

        # User is persisted in users storage
        stored = await users_storage.get_by_username("newuser")
        assert stored is not None

    async def test_accept_service_account(self, apps_manager, users_manager):
        config = "name: My App\napi_url: https://example.com\n"
        req = await apps_manager.create_registration_request(
            RegistrationRequestCreate(
                username="myapp",
                password="apppass",
                type=RegistrationRequestType.SERVICE_ACCOUNT,
                config=config,
            )
        )
        _accepted, user = await apps_manager.accept_registration_request(
            req.id, users_manager
        )
        assert user.type == UserType.SERVICE_ACCOUNT

    async def test_accept_not_found(self, apps_manager, users_manager):
        with pytest.raises(NotFoundError):
            await apps_manager.accept_registration_request(
                "nonexistent-id", users_manager
            )

    async def test_accept_already_accepted(self, apps_manager, users_manager):
        req = await apps_manager.create_registration_request(
            RegistrationRequestCreate(username="user1", password="password1")
        )
        await apps_manager.accept_registration_request(req.id, users_manager)
        with pytest.raises(InvalidError, match="not pending"):
            await apps_manager.accept_registration_request(req.id, users_manager)

    async def test_accept_already_discarded(self, apps_manager, users_manager):
        req = await apps_manager.create_registration_request(
            RegistrationRequestCreate(username="user1", password="password1")
        )
        await apps_manager.discard_registration_request(req.id)
        with pytest.raises(InvalidError, match="not pending"):
            await apps_manager.accept_registration_request(req.id, users_manager)

    async def test_accept_duplicate_username(
        self, apps_manager, users_manager, users_storage
    ):
        # Pre-create an existing user with the same username
        existing = UserInDB(
            id="existing-id",
            username="taken",
            hashed_password=hash_password("password"),
            role=Role.OPERATOR,
        )
        await users_storage.save(existing)

        req = await apps_manager.create_registration_request(
            RegistrationRequestCreate(username="taken", password="password1")
        )
        with pytest.raises(ValueError, match="already exists"):
            await apps_manager.accept_registration_request(req.id, users_manager)


class TestDiscardRegistrationRequest:
    async def test_discard(self, apps_manager):
        req = await apps_manager.create_registration_request(
            RegistrationRequestCreate(username="user1", password="password1")
        )
        discarded = await apps_manager.discard_registration_request(req.id)
        assert discarded.status == RegistrationRequestStatus.DISCARDED

    async def test_discard_not_found(self, apps_manager):
        with pytest.raises(NotFoundError):
            await apps_manager.discard_registration_request("nonexistent-id")

    async def test_discard_already_accepted(self, apps_manager, users_manager):
        req = await apps_manager.create_registration_request(
            RegistrationRequestCreate(username="user1", password="password1")
        )
        await apps_manager.accept_registration_request(req.id, users_manager)
        with pytest.raises(InvalidError, match="not pending"):
            await apps_manager.discard_registration_request(req.id)

    async def test_discard_already_discarded(self, apps_manager):
        req = await apps_manager.create_registration_request(
            RegistrationRequestCreate(username="user1", password="password1")
        )
        await apps_manager.discard_registration_request(req.id)
        with pytest.raises(InvalidError, match="not pending"):
            await apps_manager.discard_registration_request(req.id)
