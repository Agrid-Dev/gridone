"""Package HTTP contract; permission wiring lives in test_authorization.py."""

from dataclasses import replace
from importlib import import_module
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import Depends, FastAPI
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
from starlette.requests import Request

from api.auth import get_current_user_id
from api.dependencies import get_device_manager
from api.exception_handlers import register_exception_handlers
from devices_manager import DevicesServiceInterface
from devices_manager.core.presentation.package import DEFAULT_PACKAGE_LIMITS
from devices_manager.dto.driver_dto import DriverSpec
from devices_manager.dto.driver_dto.package_errors import (
    PackageDiagnostic,
    PackageImportError,
)
from models.errors import ConflictError

drivers_router = import_module("api.routes.drivers_router")
SPEC = DriverSpec.model_validate(
    {"id": "demo", "transport": "http", "device_config": [], "attributes": []}
)


@pytest.fixture
def dm():
    manager = MagicMock(spec=DevicesServiceInterface)
    manager.install_driver_package = AsyncMock(return_value=SPEC)
    manager.export_driver_package = AsyncMock(return_value=b"PK archive")
    manager.get_driver_presentation_response = AsyncMock(return_value=None)
    return manager


@pytest.fixture
def client(dm):
    app = FastAPI()
    register_exception_handlers(app)
    app.dependency_overrides[get_current_user_id] = lambda: "user-id"
    app.dependency_overrides[get_device_manager] = lambda: dm
    # Router unit tests stub permission dependencies; central authorization
    # tests exercise these same routes with real role resolution.
    for route in drivers_router.router.routes:
        assert isinstance(route, APIRoute)
        for dependency in route.dependencies:
            app.dependency_overrides[dependency.dependency] = lambda: None
    app.include_router(
        drivers_router.router,
        prefix="/drivers",
        dependencies=[Depends(get_current_user_id)],
    )
    return TestClient(app)


@pytest.mark.parametrize("media_type", ["application/zip", "application/yaml"])
def test_install_passes_raw_body_content_type_and_revision(client, dm, media_type):
    response = client.put(
        "/drivers/demo/package?expected_revision=abc",
        content=b"raw package",
        headers={"Content-Type": media_type},
    )
    assert response.status_code == 200
    assert response.json()["id"] == "demo"
    dm.install_driver_package.assert_awaited_once_with(
        "demo", b"raw package", media_type, "abc"
    )


def test_export_returns_zip_bytes(client, dm):
    response = client.get("/drivers/demo/package")
    assert response.content == b"PK archive"
    assert response.headers["content-type"] == "application/zip"
    assert response.headers["x-content-type-options"] == "nosniff"
    dm.export_driver_package.assert_awaited_once_with("demo")


def test_openapi_describes_package_bytes_and_structured_diagnostics(client):
    schema = client.get("/openapi.json").json()
    package = schema["paths"]["/drivers/{driver_id}/package"]
    assert package["get"]["responses"]["200"]["content"] == {
        "application/zip": {"schema": {"type": "string", "format": "binary"}}
    }
    assert package["put"]["responses"]["422"]["content"]["application/json"][
        "schema"
    ] == {"$ref": "#/components/schemas/PackageImportErrorResponse"}
    diagnostic = schema["components"]["schemas"]["PackageDiagnostic"]
    assert set(diagnostic["properties"]) == {
        "code",
        "path",
        "line",
        "column",
        "message",
    }


def test_presentation_absent(client, dm):
    response = client.get("/drivers/demo/presentation")
    assert response.status_code == 200
    assert response.json() is None
    dm.get_driver_presentation_response.assert_awaited_once_with("demo")


def test_structured_import_error(client, dm):
    dm.install_driver_package.side_effect = PackageImportError(
        [
            PackageDiagnostic(
                code="duplicate_key",
                path="/id",
                line=2,
                column=1,
                message="Duplicate key",
            )
        ]
    )
    response = client.put(
        "/drivers/demo/package",
        content=b"bad",
        headers={"Content-Type": "application/yaml"},
    )
    assert response.status_code == 422
    assert response.json() == {
        "detail": [
            {
                "code": "duplicate_key",
                "path": "/id",
                "line": 2,
                "column": 1,
                "message": "Duplicate key",
            }
        ]
    }


def test_conflict_is_409(client, dm):
    dm.install_driver_package.side_effect = ConflictError(
        "Presentation revision changed"
    )
    assert client.put("/drivers/demo/package", content=b"x").status_code == 409


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("chunks", "accepted"), [([b"abcd", b"efgh"], True), ([b"abcd", b"efghi"], False)]
)
async def test_stream_limit_counts_actual_chunks_not_content_length(
    monkeypatch, dm, chunks, accepted
):
    monkeypatch.setattr(
        drivers_router,
        "DEFAULT_PACKAGE_LIMITS",
        replace(DEFAULT_PACKAGE_LIMITS, max_archive_bytes=8),
    )
    received = iter(chunks)

    async def receive() -> dict:
        chunk = next(received, None)
        return {
            "type": "http.request",
            "body": chunk or b"",
            "more_body": chunk is not None,
        }

    request = Request(
        {
            "type": "http",
            "headers": [
                (b"content-type", b"application/zip"),
                (b"content-length", b"1"),
            ],
        },
        receive,
    )
    if accepted:
        await drivers_router.install_driver_package("demo", request, dm)
        dm.install_driver_package.assert_awaited_once_with(
            "demo", b"abcdefgh", "application/zip", None
        )
    else:
        with pytest.raises(PackageImportError) as info:
            await drivers_router.install_driver_package("demo", request, dm)
        assert info.value.diagnostics[0].code == "upload_too_large"
        dm.install_driver_package.assert_not_called()
