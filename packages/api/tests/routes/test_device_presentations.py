from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.auth import get_current_token_payload
from api.dependencies import get_device_manager
from api.exception_handlers import register_exception_handlers
from api.routes.devices_router import router
from devices_manager import DevicesServiceInterface
from devices_manager.core.presentation.resources import StoredResource
from devices_manager.dto.presentation_dto import UnavailablePresentationResponse
from models.errors import ConflictError, NotFoundError


@pytest.fixture
def dm():
    mock = AsyncMock(spec=DevicesServiceInterface)
    mock.get_device_presentation.return_value = UnavailablePresentationResponse(
        revision="revision", diagnostics=[]
    )
    mock.get_device_presentation_asset.return_value = StoredResource(
        b"image bytes", "image/png", "abc123", 10, 10
    )
    return mock


@pytest.fixture
def client(dm, admin_token_payload):
    app = FastAPI()
    register_exception_handlers(app)
    app.include_router(router, prefix="/devices")
    app.dependency_overrides[get_device_manager] = lambda: dm
    app.dependency_overrides[get_current_token_payload] = lambda: admin_token_payload
    with TestClient(app) as client:
        yield client


@pytest.mark.parametrize("revision", [None, "revision"])
def test_presentation_passes_revision_to_service(client, dm, revision):
    response = client.get(
        "/devices/device/presentation",
        params={} if revision is None else {"revision": revision},
    )
    assert response.status_code == 200
    assert response.json() == {
        "status": "unavailable",
        "revision": "revision",
        "diagnostics": [],
    }
    dm.get_device_presentation.assert_awaited_once_with("device", revision=revision)


def test_resource_uses_private_immutable_cache_and_exact_media_type(client, dm):
    response = client.get(
        "/devices/device/presentation/assets/bezel", params={"revision": "revision"}
    )
    assert response.status_code == 200
    assert response.content == b"image bytes"
    assert response.headers["content-type"] == "image/png"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["cache-control"] == "private, max-age=31536000, immutable"
    assert response.headers["etag"] == '"abc123"'
    dm.get_device_presentation_asset.assert_awaited_once_with(
        "device", "revision", "bezel"
    )


def test_openapi_describes_normalized_image_bytes(client):
    schema = client.get("/openapi.json").json()
    asset = schema["paths"]["/devices/{device_id}/presentation/assets/{asset_id}"][
        "get"
    ]
    assert asset["responses"]["200"]["content"] == {
        "image/png": {"schema": {"type": "string", "format": "binary"}}
    }


@pytest.mark.parametrize("query", ["", "?revision="])
def test_resource_requires_revision(client, dm, query):
    response = client.get(f"/devices/device/presentation/assets/bezel{query}")
    assert response.status_code == 422
    dm.get_device_presentation_asset.assert_not_awaited()


@pytest.mark.parametrize(
    ("path", "method"),
    [
        ("presentation", "get_device_presentation"),
        ("presentation/assets/bezel", "get_device_presentation_asset"),
    ],
)
@pytest.mark.parametrize(
    ("error", "status"), [(ConflictError, 409), (NotFoundError, 404)]
)
def test_service_errors_use_global_handlers(client, dm, path, method, error, status):  # noqa: PLR0913
    getattr(dm, method).side_effect = error("Unavailable")
    response = client.get(f"/devices/device/{path}?revision=old")
    assert response.status_code == status
