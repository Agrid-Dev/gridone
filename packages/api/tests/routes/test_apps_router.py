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
from models.errors import AppUnreachableError, InvalidError, NotFoundError
from users.auth import TokenPayload

from api.dependencies import get_apps_service, get_current_token_payload
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


DUMMY_SCHEMA = {
    "type": "object",
    "properties": {"lat": {"type": "number"}, "lng": {"type": "number"}},
    "required": ["lat", "lng"],
}
DUMMY_CONFIG = {"lat": 48.8, "lng": 2.3}


@pytest.fixture
def apps_manager() -> AsyncMock:
    am = AsyncMock()
    am.list_apps = AsyncMock(return_value=[DUMMY_APP])
    am.get_app = AsyncMock(return_value=DUMMY_APP)
    am.enable_app = AsyncMock(return_value=DUMMY_APP)
    am.disable_app = AsyncMock(return_value=DUMMY_APP)
    am.get_config_schema = AsyncMock(return_value=DUMMY_SCHEMA)
    am.get_config = AsyncMock(return_value=DUMMY_CONFIG)
    am.update_config = AsyncMock(return_value=DUMMY_CONFIG)
    return am


@pytest.fixture
def app(apps_manager: AsyncMock) -> FastAPI:
    service = AsyncMock()
    service.apps = apps_manager
    test_app = FastAPI()
    test_app.dependency_overrides[get_apps_service] = lambda: service
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


# ── GET /apps/{app_id}/config/schema ────────────────────────


def test_get_config_schema(app: FastAPI):
    with TestClient(app) as client:
        resp = client.get("/apps/app-1/config/schema")
        assert resp.status_code == 200
        assert resp.json()["type"] == "object"
        assert "lat" in resp.json()["properties"]


def test_get_config_schema_not_found(app: FastAPI, apps_manager: AsyncMock):
    apps_manager.get_config_schema = AsyncMock(
        side_effect=NotFoundError("No config schema")
    )
    with TestClient(app) as client:
        resp = client.get("/apps/app-1/config/schema")
        assert resp.status_code == 404


def test_get_config_schema_app_unreachable(app: FastAPI, apps_manager: AsyncMock):
    apps_manager.get_config_schema = AsyncMock(
        side_effect=AppUnreachableError("App unreachable")
    )
    with TestClient(app) as client:
        resp = client.get("/apps/app-1/config/schema")
        assert resp.status_code == 502


# ── GET /apps/{app_id}/config ──────────────────────────────


def test_get_config(app: FastAPI):
    with TestClient(app) as client:
        resp = client.get("/apps/app-1/config")
        assert resp.status_code == 200
        assert resp.json() == {"lat": 48.8, "lng": 2.3}


def test_get_config_app_unreachable(app: FastAPI, apps_manager: AsyncMock):
    apps_manager.get_config = AsyncMock(
        side_effect=AppUnreachableError("App unreachable")
    )
    with TestClient(app) as client:
        resp = client.get("/apps/app-1/config")
        assert resp.status_code == 502


# ── PATCH /apps/{app_id}/config ────────────────────────────


def test_update_config(app: FastAPI, apps_manager: AsyncMock):
    with TestClient(app) as client:
        resp = client.patch("/apps/app-1/config", json={"lat": 40.7, "lng": -74.0})
        assert resp.status_code == 200
        apps_manager.update_config.assert_called_once_with(
            "app-1", {"lat": 40.7, "lng": -74.0}
        )


def test_update_config_validation_error(app: FastAPI, apps_manager: AsyncMock):
    apps_manager.update_config = AsyncMock(
        side_effect=InvalidError("App returned 422: lat must be between -90 and 90")
    )
    with TestClient(app) as client:
        resp = client.patch("/apps/app-1/config", json={"lat": 999})
        assert resp.status_code == 422


def test_update_config_app_unreachable(app: FastAPI, apps_manager: AsyncMock):
    apps_manager.update_config = AsyncMock(
        side_effect=AppUnreachableError("App unreachable")
    )
    with TestClient(app) as client:
        resp = client.patch("/apps/app-1/config", json={"lat": 40.7})
        assert resp.status_code == 502


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
