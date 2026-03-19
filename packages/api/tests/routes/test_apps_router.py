"""Tests for apps CRUD, enable/disable endpoints.

Auth and permission checks are tested centrally in test_authorization.py.
These tests focus on business logic by overriding get_current_token_payload.
"""

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import pytest
from apps import App, AppStatus
from fastapi import FastAPI
from fastapi.testclient import TestClient
from models.errors import NotFoundError
from users.auth import TokenPayload

from api.dependencies import get_apps_manager, get_current_token_payload
from api.exception_handlers import register_exception_handlers
from api.routes.apps import apps_router

NOW = datetime.now(UTC)

DUMMY_APP = App(
    id="app-1",
    user_id="user-1",
    name="My App",
    description="A test app",
    api_url="https://example.com",
    icon="https://example.com/icon.png",
    status=AppStatus.REGISTERED,
    manifest="name: My App\n",
    created_at=NOW,
)

ADMIN_PAYLOAD = TokenPayload(
    sub="admin-id",
    role="admin",
    type="access",
    exp=datetime.now(UTC) + timedelta(hours=1),
)


@pytest.fixture
def apps_manager() -> AsyncMock:
    am = AsyncMock()
    am.list_apps = AsyncMock(return_value=[DUMMY_APP])
    am.get_app = AsyncMock(return_value=DUMMY_APP)
    am.enable_app = AsyncMock(return_value=DUMMY_APP)
    am.disable_app = AsyncMock(return_value=DUMMY_APP)
    return am


@pytest.fixture
def app(apps_manager: AsyncMock) -> FastAPI:
    test_app = FastAPI()
    test_app.dependency_overrides[get_apps_manager] = lambda: apps_manager
    test_app.dependency_overrides[get_current_token_payload] = lambda: ADMIN_PAYLOAD
    test_app.include_router(apps_router, prefix="/apps")
    register_exception_handlers(test_app)
    return test_app


# ── GET /apps/ ────────────────────────────────────────────────


def test_list_apps(app: FastAPI):
    with TestClient(app) as client:
        resp = client.get("/apps/")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["id"] == "app-1"
        assert data[0]["name"] == "My App"
        assert data[0]["health_url"] == "https://example.com/health"


def test_list_apps_empty(app: FastAPI, apps_manager: AsyncMock):
    apps_manager.list_apps = AsyncMock(return_value=[])
    with TestClient(app) as client:
        resp = client.get("/apps/")
        assert resp.status_code == 200
        assert resp.json() == []


# ── GET /apps/{app_id} ───────────────────────────────────────


def test_get_app(app: FastAPI):
    with TestClient(app) as client:
        resp = client.get("/apps/app-1")
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == "app-1"
        assert data["name"] == "My App"
        assert data["status"] == "registered"


def test_get_app_not_found(app: FastAPI, apps_manager: AsyncMock):
    apps_manager.get_app = AsyncMock(
        side_effect=NotFoundError("App 'bad-id' not found")
    )
    with TestClient(app) as client:
        resp = client.get("/apps/bad-id")
        assert resp.status_code == 404


# ── POST /apps/{app_id}/enable ───────────────────────────────


def test_enable_app(app: FastAPI):
    with TestClient(app) as client:
        resp = client.post("/apps/app-1/enable")
        assert resp.status_code == 200
        assert resp.json()["id"] == "app-1"


def test_enable_app_not_found(app: FastAPI, apps_manager: AsyncMock):
    apps_manager.enable_app = AsyncMock(
        side_effect=NotFoundError("App 'bad-id' not found")
    )
    with TestClient(app) as client:
        resp = client.post("/apps/bad-id/enable")
        assert resp.status_code == 404


# ── POST /apps/{app_id}/disable ──────────────────────────────


def test_disable_app(app: FastAPI):
    with TestClient(app) as client:
        resp = client.post("/apps/app-1/disable")
        assert resp.status_code == 200
        assert resp.json()["id"] == "app-1"


def test_disable_app_not_found(app: FastAPI, apps_manager: AsyncMock):
    apps_manager.disable_app = AsyncMock(
        side_effect=NotFoundError("App 'bad-id' not found")
    )
    with TestClient(app) as client:
        resp = client.post("/apps/bad-id/disable")
        assert resp.status_code == 404
