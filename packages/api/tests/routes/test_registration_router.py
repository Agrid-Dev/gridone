"""Tests for apps registration-requests endpoints.

Auth and permission checks are tested centrally in test_authorization.py.
These tests focus on business logic by overriding get_current_token_payload.
"""

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import pytest
from apps import (
    App,
    AppStatus,
    RegistrationRequest,
    RegistrationRequestStatus,
)
from fastapi import FastAPI
from fastapi.testclient import TestClient
from models.errors import InvalidError, NotFoundError
from users import User
from users.auth import TokenPayload

from api.dependencies import (
    get_apps_manager,
    get_current_token_payload,
    get_registration_requests_manager,
)
from api.exception_handlers import register_exception_handlers
from api.routes.apps import apps_registration_router

NOW = datetime.now(UTC)

VALID_CONFIG = "name: My App\napi_url: https://example.com\n"

PENDING_REQ = RegistrationRequest(
    id="req-1",
    username="myapp",
    hashed_password="$2b$12$fakehash",
    status=RegistrationRequestStatus.PENDING,
    created_at=NOW,
    config=VALID_CONFIG,
)

ACCEPTED_REQ = PENDING_REQ.model_copy(
    update={"status": RegistrationRequestStatus.ACCEPTED}
)

ADMIN_PAYLOAD = TokenPayload(
    sub="admin-id",
    role="admin",
    type="access",
    exp=datetime.now(UTC) + timedelta(hours=1),
)


# ── Fixtures ─────────────────────────────────────────────────────


@pytest.fixture
def registration_requests_manager() -> AsyncMock:
    rrm = AsyncMock()
    rrm.create_registration_request = AsyncMock(return_value=PENDING_REQ)
    rrm.list_registration_requests = AsyncMock(return_value=[PENDING_REQ])
    rrm.get_registration_request = AsyncMock(return_value=PENDING_REQ)
    rrm.accept_registration_request = AsyncMock(return_value=ACCEPTED_REQ)
    rrm.discard_registration_request = AsyncMock(
        return_value=PENDING_REQ.model_copy(
            update={"status": RegistrationRequestStatus.DISCARDED}
        )
    )
    return rrm


@pytest.fixture
def apps_manager() -> AsyncMock:
    am = AsyncMock()
    dummy_app = App(
        id="app-1",
        user_id="new-id",
        name="My App",
        description="",
        api_url="https://example.com",
        icon="",
        status=AppStatus.REGISTERED,
        manifest=VALID_CONFIG,
        created_at=NOW,
    )
    am.create_app = AsyncMock(
        return_value=(User(id="new-id", username="myapp"), dummy_app)
    )
    return am


@pytest.fixture
def app(registration_requests_manager: AsyncMock, apps_manager: AsyncMock) -> FastAPI:
    test_app = FastAPI()
    test_app.dependency_overrides[get_registration_requests_manager] = lambda: (
        registration_requests_manager
    )
    test_app.dependency_overrides[get_apps_manager] = lambda: apps_manager
    test_app.dependency_overrides[get_current_token_payload] = lambda: ADMIN_PAYLOAD
    test_app.include_router(apps_registration_router, prefix="/apps")
    register_exception_handlers(test_app)
    return test_app


# ── POST /apps/registration-requests (public) ───────────────────


def test_create_registration_request(app: FastAPI):
    with TestClient(app) as client:
        resp = client.post(
            "/apps/registration-requests",
            json={
                "username": "myapp",
                "password": "securepassword",
                "config": VALID_CONFIG,
            },
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["username"] == "myapp"
        assert data["status"] == "pending"


def test_create_registration_request_invalid_config(
    app: FastAPI, registration_requests_manager: AsyncMock
):
    registration_requests_manager.create_registration_request = AsyncMock(
        side_effect=InvalidError("config is not valid YAML")
    )
    with TestClient(app) as client:
        resp = client.post(
            "/apps/registration-requests",
            json={
                "username": "myapp",
                "password": "securepassword",
                "config": "[bad yaml",
            },
        )
        assert resp.status_code == 422


def test_create_registration_request_validation_error(app: FastAPI):
    """Short username should fail pydantic validation."""
    with TestClient(app) as client:
        resp = client.post(
            "/apps/registration-requests",
            json={
                "username": "ab",
                "password": "securepassword",
                "config": VALID_CONFIG,
            },
        )
        assert resp.status_code == 422


# ── GET /apps/registration-requests (admin only) ────────────────


def test_list_registration_requests(app: FastAPI):
    with TestClient(app) as client:
        resp = client.get("/apps/registration-requests")
        assert resp.status_code == 200
        assert len(resp.json()) == 1


# ── GET /apps/registration-requests/{id} (public) ───────────────


def test_get_registration_request(app: FastAPI):
    with TestClient(app) as client:
        resp = client.get("/apps/registration-requests/req-1")
        assert resp.status_code == 200
        assert resp.json()["id"] == "req-1"


def test_get_registration_request_not_found(
    app: FastAPI, registration_requests_manager: AsyncMock
):
    registration_requests_manager.get_registration_request = AsyncMock(
        side_effect=NotFoundError("not found")
    )
    with TestClient(app) as client:
        resp = client.get("/apps/registration-requests/nonexistent")
        assert resp.status_code == 404


# ── POST /apps/registration-requests/{id}/accept (admin) ────────


def test_accept_registration_request(app: FastAPI):
    with TestClient(app) as client:
        resp = client.post("/apps/registration-requests/req-1/accept")
        assert resp.status_code == 200
        data = resp.json()
        assert data["request"]["status"] == "accepted"
        assert data["user"]["username"] == "myapp"
        assert data["app"]["id"] == "app-1"
        assert data["app"]["name"] == "My App"


def test_accept_registration_request_not_found(
    app: FastAPI, registration_requests_manager: AsyncMock
):
    registration_requests_manager.accept_registration_request = AsyncMock(
        side_effect=NotFoundError("not found")
    )
    with TestClient(app) as client:
        resp = client.post("/apps/registration-requests/bad-id/accept")
        assert resp.status_code == 404


def test_accept_registration_request_not_pending(
    app: FastAPI, registration_requests_manager: AsyncMock
):
    registration_requests_manager.accept_registration_request = AsyncMock(
        side_effect=InvalidError("not pending")
    )
    with TestClient(app) as client:
        resp = client.post("/apps/registration-requests/req-1/accept")
        assert resp.status_code == 422


def test_accept_registration_request_duplicate_username(
    app: FastAPI, apps_manager: AsyncMock
):
    apps_manager.create_app = AsyncMock(
        side_effect=ValueError("Username 'taken' already exists")
    )
    with TestClient(app) as client:
        resp = client.post("/apps/registration-requests/req-1/accept")
        assert resp.status_code == 409


# ── POST /apps/registration-requests/{id}/discard (admin) ───────


def test_discard_registration_request(app: FastAPI):
    with TestClient(app) as client:
        resp = client.post("/apps/registration-requests/req-1/discard")
        assert resp.status_code == 200
        assert resp.json()["status"] == "discarded"


def test_discard_registration_request_not_found(
    app: FastAPI, registration_requests_manager: AsyncMock
):
    registration_requests_manager.discard_registration_request = AsyncMock(
        side_effect=NotFoundError("not found")
    )
    with TestClient(app) as client:
        resp = client.post("/apps/registration-requests/bad-id/discard")
        assert resp.status_code == 404


def test_discard_registration_request_not_pending(
    app: FastAPI, registration_requests_manager: AsyncMock
):
    registration_requests_manager.discard_registration_request = AsyncMock(
        side_effect=InvalidError("not pending")
    )
    with TestClient(app) as client:
        resp = client.post("/apps/registration-requests/req-1/discard")
        assert resp.status_code == 422
