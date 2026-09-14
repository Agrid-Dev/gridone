from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

from api.auth import get_current_user_id
from api.exception_handlers import register_exception_handlers
from api.routes.device_views_router import get_device_views_service, router
from device_views import DeviceView, DeviceViewInput, DeviceViewsService
from models.errors import NotFoundError


@pytest.fixture
def context():
    now = datetime.now(UTC)
    service = AsyncMock(spec=DeviceViewsService)
    view = DeviceView(
        id="v",
        name="Building",
        group_by=["floor", "room"],
        created_at=now,
        updated_at=now,
    )
    service.create.return_value = view
    service.get.return_value = view
    service.update.return_value = view
    service.list.return_value = [view]
    app = FastAPI()
    register_exception_handlers(app)
    # Permission wiring is tested centrally in test_authorization.py.
    for route in router.routes:
        assert isinstance(route, APIRoute)
        for dependency in route.dependencies:
            app.dependency_overrides[dependency.dependency] = lambda: None
    app.dependency_overrides[get_current_user_id] = lambda: "operator"
    app.dependency_overrides[get_device_views_service] = lambda: service
    app.include_router(router, prefix="/device-views")
    with TestClient(app) as client:
        yield client, service


def test_crud_uses_display_configuration_only(context):
    client, service = context
    body = {"name": "Building", "group_by": ["floor", "room"]}
    assert client.post("/device-views", json=body).status_code == 201
    service.create.assert_awaited_once_with(DeviceViewInput.model_validate(body))
    assert client.get("/device-views").json()[0]["id"] == "v"
    assert client.get("/device-views/v").json()["group_by"] == ["floor", "room"]
    assert client.put("/device-views/v", json=body).status_code == 200
    service.update.assert_awaited_once_with("v", DeviceViewInput.model_validate(body))
    assert client.delete("/device-views/v").status_code == 204
    service.delete.assert_awaited_once_with("v")


def test_missing_view_uses_global_not_found_handler(context):
    client, service = context
    service.get.side_effect = NotFoundError("Device view not found")
    assert client.get("/device-views/missing").status_code == 404


@pytest.mark.parametrize(
    "extra",
    [
        {"device_ids": ["a"]},
        {"filter": {"ids": ["a"]}},
        {"filter": {"group_id": "old"}},
    ],
)
def test_explicit_members_and_obsolete_group_targets_are_rejected(context, extra):
    client, service = context
    response = client.post(
        "/device-views", json={"name": "Building", "group_by": ["floor"], **extra}
    )
    assert response.status_code == 422
    service.create.assert_not_awaited()
