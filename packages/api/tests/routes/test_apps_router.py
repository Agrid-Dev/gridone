"""Tests for apps CRUD, enable/disable endpoints.

Auth and permission checks are tested centrally in test_authorization.py.
These tests focus on business logic by overriding get_current_token_payload.
"""

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.dependencies import get_apps_service, get_current_token_payload
from api.exception_handlers import register_exception_handlers
from api.routes.apps import apps_router
from apps import App, AppStatus, PushStatus
from apps.config_validation import validate_config
from apps.errors import (
    AppUnreachableError,
    ConfigValidationError,
    InvalidAppSchemaError,
    ValidationErrorItem,
)
from models.errors import InvalidError, NotFoundError
from users.auth import TokenPayload

NOW = datetime.now(UTC)

MANIFEST = (
    "name: My App\n"
    "produces: [weather_sensor]\n"
    "reads:\n"
    "  thermostat: [temperature]\n"
    "commands:\n"
    "  thermostat: [temperature_setpoint]\n"
)

EXPECTED_CAPABILITIES = {
    "produces": ["weather_sensor"],
    "reads": {"thermostat": ["temperature"]},
    "commands": {"thermostat": ["temperature_setpoint"]},
}

DUMMY_APP = App(
    id="app-1",
    user_id="user-1",
    name="My App",
    description="A test app",
    api_url="https://example.com",
    icon="https://example.com/icon.png",
    status=AppStatus.REGISTERED,
    manifest=MANIFEST,
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
DUMMY_APP_WITH_CONFIG = DUMMY_APP.model_copy(
    update={"config": DUMMY_CONFIG, "push_status": PushStatus.OK}
)


@pytest.fixture
def apps_service() -> AsyncMock:
    service = AsyncMock()
    service.list_apps = AsyncMock(return_value=[DUMMY_APP])
    service.get_app = AsyncMock(return_value=DUMMY_APP)
    service.enable_app = AsyncMock(return_value=DUMMY_APP)
    service.disable_app = AsyncMock(return_value=DUMMY_APP)
    service.get_config_schema = AsyncMock(return_value=DUMMY_SCHEMA)
    service.get_config = AsyncMock(return_value=DUMMY_CONFIG)
    service.update_config = AsyncMock(return_value=DUMMY_APP_WITH_CONFIG)
    return service


@pytest.fixture
def app(apps_service: AsyncMock) -> FastAPI:
    test_app = FastAPI()
    test_app.dependency_overrides[get_apps_service] = lambda: apps_service
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


def test_list_apps_empty(app: FastAPI, apps_service: AsyncMock):
    apps_service.list_apps = AsyncMock(return_value=[])
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
        assert data["capabilities"] == EXPECTED_CAPABILITIES


def test_get_app_not_found(app: FastAPI, apps_service: AsyncMock):
    apps_service.get_app = AsyncMock(
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


def test_get_config_schema_not_found(app: FastAPI, apps_service: AsyncMock):
    apps_service.get_config_schema = AsyncMock(
        side_effect=NotFoundError("No config schema")
    )
    with TestClient(app) as client:
        resp = client.get("/apps/app-1/config/schema")
        assert resp.status_code == 404


def test_get_config_schema_app_unreachable(app: FastAPI, apps_service: AsyncMock):
    apps_service.get_config_schema = AsyncMock(
        side_effect=AppUnreachableError("App unreachable")
    )
    with TestClient(app) as client:
        resp = client.get("/apps/app-1/config/schema")
        assert resp.status_code == 503


def test_get_config_schema_invalid_schema_is_a_503(
    app: FastAPI, apps_service: AsyncMock
):
    """A broken schema must read as an app fault on the READ path too — not
    render as 'this app has no configuration' in the UI."""
    apps_service.get_config_schema = AsyncMock(
        side_effect=InvalidAppSchemaError("App returned an invalid config schema")
    )
    with TestClient(app) as client:
        resp = client.get("/apps/app-1/config/schema")
        assert resp.status_code == 503
        assert resp.json()["detail"] == "App returned an invalid config schema"


# ── GET /apps/{app_id}/config ──────────────────────────────


def test_get_config(app: FastAPI):
    with TestClient(app) as client:
        resp = client.get("/apps/app-1/config")
        assert resp.status_code == 200
        assert resp.json() == {"lat": 48.8, "lng": 2.3}


# ── PATCH /apps/{app_id}/config ────────────────────────────


def test_update_config(app: FastAPI, apps_service: AsyncMock):
    with TestClient(app) as client:
        resp = client.patch("/apps/app-1/config", json={"lat": 40.7, "lng": -74.0})
        assert resp.status_code == 200
        assert resp.json() == {"config": DUMMY_CONFIG, "push_status": "ok"}
        apps_service.update_config.assert_called_once_with(
            "app-1", {"lat": 40.7, "lng": -74.0}
        )


def test_update_config_validation_error_emits_pydantic_contract(
    app: FastAPI, apps_service: AsyncMock
):
    """Pins AGR-921 shape 5: 422 with `detail: [{loc, msg, type}]`, the same
    envelope FastAPI emits for pydantic request validation, `loc` relative to
    the config object (numeric indices included, no `body` prefix).
    """
    apps_service.update_config = AsyncMock(
        side_effect=ConfigValidationError(
            [
                ValidationErrorItem(
                    loc=("meters", 0, "point_id"),
                    msg="42 is not of type 'string'",
                    type="type",
                ),
                ValidationErrorItem(
                    loc=("lng",),
                    msg="'lng' is a required property",
                    type="missing",
                ),
            ]
        )
    )
    with TestClient(app) as client:
        resp = client.patch(
            "/apps/app-1/config", json={"meters": [{"point_id": 42}], "lat": 48.8}
        )
        assert resp.status_code == 422
        assert resp.json() == {
            "detail": [
                {
                    "loc": ["meters", 0, "point_id"],
                    "msg": "42 is not of type 'string'",
                    "type": "type",
                },
                {
                    "loc": ["lng"],
                    "msg": "'lng' is a required property",
                    "type": "missing",
                },
            ]
        }


def test_update_config_emits_real_jsonschema_items_end_to_end(
    app: FastAPI, apps_service: AsyncMock
):
    """Drives a REAL `validate_config` failure through the handler: the items
    are jsonschema-produced, not hand-built, so a regression in the mapping
    layer (loc types, the `required` -> field-level rewrite) fails here even
    though every layer's own unit tests construct their inputs themselves.
    """
    schema = {
        "type": "object",
        "properties": {
            "api_key": {"type": "string"},
            "meters": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {"point_id": {"type": "string"}},
                    "required": ["point_id"],
                },
            },
        },
        "required": ["api_key"],
    }
    payload = {"meters": [{"point_id": 42}]}
    with pytest.raises(ConfigValidationError) as exc_info:
        validate_config(payload, schema)
    apps_service.update_config = AsyncMock(side_effect=exc_info.value)

    with TestClient(app) as client:
        resp = client.patch("/apps/app-1/config", json=payload)

    assert resp.status_code == 422
    assert resp.json() == {
        "detail": [
            {
                "loc": ["api_key"],
                "msg": "'api_key' is a required property",
                "type": "missing",
            },
            {
                "loc": ["meters", 0, "point_id"],
                "msg": "42 is not of type 'string'",
                "type": "type",
            },
        ]
    }


def test_update_config_plain_invalid_error_keeps_string_detail(
    app: FastAPI, apps_service: AsyncMock
):
    """A non-config InvalidError (e.g. the app rejects the schema fetch) stays
    AGR-921 shape 4: the exact-class handler must not swallow the base one.
    """
    apps_service.update_config = AsyncMock(
        side_effect=InvalidError("App returned 400: bad request")
    )
    with TestClient(app) as client:
        resp = client.patch("/apps/app-1/config", json={"lat": 40.7})
        assert resp.status_code == 422
        assert resp.json() == {"detail": "App returned 400: bad request"}


def test_update_config_app_unreachable(app: FastAPI, apps_service: AsyncMock):
    apps_service.update_config = AsyncMock(
        side_effect=AppUnreachableError("App unreachable")
    )
    with TestClient(app) as client:
        resp = client.patch("/apps/app-1/config", json={"lat": 40.7})
        assert resp.status_code == 503


def test_update_config_invalid_app_schema(app: FastAPI, apps_service: AsyncMock):
    """A malformed schema is the app's fault: 503, not a 422 blaming the payload."""
    apps_service.update_config = AsyncMock(
        side_effect=InvalidAppSchemaError("App returned an invalid config schema")
    )
    with TestClient(app) as client:
        resp = client.patch("/apps/app-1/config", json={"lat": 40.7})
        assert resp.status_code == 503
        assert resp.json()["detail"] == "App returned an invalid config schema"


# ── POST /apps/{app_id}/enable ───────────────────────────────


def test_enable_app(app: FastAPI):
    with TestClient(app) as client:
        resp = client.post("/apps/app-1/enable")
        assert resp.status_code == 200
        assert resp.json()["id"] == "app-1"


def test_enable_app_not_found(app: FastAPI, apps_service: AsyncMock):
    apps_service.enable_app = AsyncMock(
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


def test_disable_app_not_found(app: FastAPI, apps_service: AsyncMock):
    apps_service.disable_app = AsyncMock(
        side_effect=NotFoundError("App 'bad-id' not found")
    )
    with TestClient(app) as client:
        resp = client.post("/apps/bad-id/disable")
        assert resp.status_code == 404
