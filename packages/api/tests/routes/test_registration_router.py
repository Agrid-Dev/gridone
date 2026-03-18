"""Tests for apps registration-requests endpoints."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest
from apps import (
    RegistrationRequest,
    RegistrationRequestStatus,
    RegistrationRequestType,
)
from fastapi import FastAPI
from fastapi.testclient import TestClient
from models.errors import BlockedUserError, InvalidError, NotFoundError
from users import Role, User
from users.auth import AuthService

from api.dependencies import (
    get_apps_manager,
    get_users_manager,
)
from api.exception_handlers import register_exception_handlers
from api.routes.apps import apps_registration_router
from api.routes.users.auth_router import router as auth_router

ADMIN = User(id="admin-id", username="admin", role=Role.ADMIN, name="Admin")
BOB = User(id="bob-id", username="bob", role=Role.OPERATOR, name="Bob")

NOW = datetime.now(UTC)

PENDING_REQ = RegistrationRequest(
    id="req-1",
    username="newuser",
    hashed_password="$2b$12$fakehash",
    type=RegistrationRequestType.USER,
    status=RegistrationRequestStatus.PENDING,
    created_at=NOW,
    config="",
)

ACCEPTED_REQ = PENDING_REQ.model_copy(
    update={"status": RegistrationRequestStatus.ACCEPTED}
)


# ── Fixtures ─────────────────────────────────────────────────────


@pytest.fixture
def users_manager() -> AsyncMock:
    um = AsyncMock()

    async def _authenticate(username: str, password: str):
        creds = {"admin": "admin", "bob": "bob"}
        users = {"admin": ADMIN, "bob": BOB}
        if creds.get(username) != password:
            return None
        user = users[username]
        if user.is_blocked:
            msg = f"User '{username}' is blocked"
            raise BlockedUserError(msg)
        return user

    async def _is_blocked(user_id: str):
        return False

    um.authenticate = AsyncMock(side_effect=_authenticate)
    um.is_blocked = AsyncMock(side_effect=_is_blocked)
    return um


@pytest.fixture
def apps_manager() -> AsyncMock:
    am = AsyncMock()
    am.create_registration_request = AsyncMock(return_value=PENDING_REQ)
    am.list_registration_requests = AsyncMock(return_value=[PENDING_REQ])
    am.get_registration_request = AsyncMock(return_value=PENDING_REQ)
    am.accept_registration_request = AsyncMock(
        return_value=(ACCEPTED_REQ, User(id="new-id", username="newuser"))
    )
    am.discard_registration_request = AsyncMock(
        return_value=PENDING_REQ.model_copy(
            update={"status": RegistrationRequestStatus.DISCARDED}
        )
    )
    return am


@pytest.fixture
def app(users_manager: AsyncMock, apps_manager: AsyncMock) -> FastAPI:
    test_app = FastAPI()
    test_app.state.auth_service = AuthService(secret_key="test-secret")
    test_app.state.cookie_secure = False
    test_app.dependency_overrides[get_users_manager] = lambda: users_manager
    test_app.dependency_overrides[get_apps_manager] = lambda: apps_manager
    test_app.include_router(auth_router, prefix="/auth")
    test_app.include_router(apps_registration_router, prefix="/apps")
    register_exception_handlers(test_app)
    return test_app


def _login(client: TestClient, username: str) -> str:
    resp = client.post(
        "/auth/login",
        data={
            "grant_type": "password",
            "username": username,
            "password": username,
        },
    )
    assert resp.status_code == 200
    return resp.json()["access_token"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# ── POST /apps/registration-requests (public) ───────────────────


def test_create_registration_request(app: FastAPI):
    with TestClient(app) as client:
        resp = client.post(
            "/apps/registration-requests",
            json={
                "username": "newuser",
                "password": "securepassword",
            },
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["username"] == "newuser"
        assert data["status"] == "pending"


def test_create_registration_request_no_auth_needed(app: FastAPI):
    """POST /registration-requests is public — no token needed."""
    with TestClient(app) as client:
        resp = client.post(
            "/apps/registration-requests",
            json={"username": "newuser", "password": "securepassword"},
        )
        assert resp.status_code == 201


def test_create_registration_request_invalid_config(
    app: FastAPI, apps_manager: AsyncMock
):
    apps_manager.create_registration_request = AsyncMock(
        side_effect=InvalidError("config is not valid YAML")
    )
    with TestClient(app) as client:
        resp = client.post(
            "/apps/registration-requests",
            json={
                "username": "myapp",
                "password": "securepassword",
                "type": "service_account",
                "config": "[bad yaml",
            },
        )
        assert resp.status_code == 422


def test_create_registration_request_validation_error(app: FastAPI):
    """Short username should fail pydantic validation."""
    with TestClient(app) as client:
        resp = client.post(
            "/apps/registration-requests",
            json={"username": "ab", "password": "securepassword"},
        )
        assert resp.status_code == 422


# ── GET /apps/registration-requests (admin only) ────────────────


def test_list_registration_requests_admin(app: FastAPI):
    with TestClient(app) as client:
        token = _login(client, "admin")
        resp = client.get("/apps/registration-requests", headers=_auth(token))
        assert resp.status_code == 200
        assert len(resp.json()) == 1


def test_list_registration_requests_operator_forbidden(app: FastAPI):
    with TestClient(app) as client:
        token = _login(client, "bob")
        resp = client.get("/apps/registration-requests", headers=_auth(token))
        assert resp.status_code == 403


def test_list_registration_requests_no_auth(app: FastAPI):
    with TestClient(app) as client:
        resp = client.get("/apps/registration-requests")
        assert resp.status_code == 401


# ── GET /apps/registration-requests/{id} (public) ───────────────


def test_get_registration_request(app: FastAPI):
    with TestClient(app) as client:
        resp = client.get("/apps/registration-requests/req-1")
        assert resp.status_code == 200
        assert resp.json()["id"] == "req-1"


def test_get_registration_request_not_found(app: FastAPI, apps_manager: AsyncMock):
    apps_manager.get_registration_request = AsyncMock(
        side_effect=NotFoundError("not found")
    )
    with TestClient(app) as client:
        resp = client.get("/apps/registration-requests/nonexistent")
        assert resp.status_code == 404


# ── POST /apps/registration-requests/{id}/accept (admin) ────────


def test_accept_registration_request(app: FastAPI):
    with TestClient(app) as client:
        token = _login(client, "admin")
        resp = client.post(
            "/apps/registration-requests/req-1/accept",
            headers=_auth(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["request"]["status"] == "accepted"
        assert data["user"]["username"] == "newuser"


def test_accept_registration_request_not_found(app: FastAPI, apps_manager: AsyncMock):
    apps_manager.accept_registration_request = AsyncMock(
        side_effect=NotFoundError("not found")
    )
    with TestClient(app) as client:
        token = _login(client, "admin")
        resp = client.post(
            "/apps/registration-requests/bad-id/accept",
            headers=_auth(token),
        )
        assert resp.status_code == 404


def test_accept_registration_request_not_pending(app: FastAPI, apps_manager: AsyncMock):
    apps_manager.accept_registration_request = AsyncMock(
        side_effect=InvalidError("not pending")
    )
    with TestClient(app) as client:
        token = _login(client, "admin")
        resp = client.post(
            "/apps/registration-requests/req-1/accept",
            headers=_auth(token),
        )
        assert resp.status_code == 422


def test_accept_registration_request_duplicate_username(
    app: FastAPI, apps_manager: AsyncMock
):
    apps_manager.accept_registration_request = AsyncMock(
        side_effect=ValueError("Username 'taken' already exists")
    )
    with TestClient(app) as client:
        token = _login(client, "admin")
        resp = client.post(
            "/apps/registration-requests/req-1/accept",
            headers=_auth(token),
        )
        assert resp.status_code == 409


def test_accept_registration_request_operator_forbidden(app: FastAPI):
    with TestClient(app) as client:
        token = _login(client, "bob")
        resp = client.post(
            "/apps/registration-requests/req-1/accept",
            headers=_auth(token),
        )
        assert resp.status_code == 403


# ── POST /apps/registration-requests/{id}/discard (admin) ───────


def test_discard_registration_request(app: FastAPI):
    with TestClient(app) as client:
        token = _login(client, "admin")
        resp = client.post(
            "/apps/registration-requests/req-1/discard",
            headers=_auth(token),
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "discarded"


def test_discard_registration_request_not_found(app: FastAPI, apps_manager: AsyncMock):
    apps_manager.discard_registration_request = AsyncMock(
        side_effect=NotFoundError("not found")
    )
    with TestClient(app) as client:
        token = _login(client, "admin")
        resp = client.post(
            "/apps/registration-requests/bad-id/discard",
            headers=_auth(token),
        )
        assert resp.status_code == 404


def test_discard_registration_request_not_pending(
    app: FastAPI, apps_manager: AsyncMock
):
    apps_manager.discard_registration_request = AsyncMock(
        side_effect=InvalidError("not pending")
    )
    with TestClient(app) as client:
        token = _login(client, "admin")
        resp = client.post(
            "/apps/registration-requests/req-1/discard",
            headers=_auth(token),
        )
        assert resp.status_code == 422


def test_discard_registration_request_operator_forbidden(app: FastAPI):
    with TestClient(app) as client:
        token = _login(client, "bob")
        resp = client.post(
            "/apps/registration-requests/req-1/discard",
            headers=_auth(token),
        )
        assert resp.status_code == 403
