import json
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.auth import get_current_role, get_current_token_payload, get_current_user_id
from api.dependencies import (
    get_assets_service,
    get_device_manager,
    get_documents_service,
)
from api.exception_handlers import register_exception_handlers
from api.routes.documents_router import router
from assets import AssetsService
from devices_manager import DevicesServiceInterface
from documents import (
    Document,
    DocumentContent,
    DocumentsService,
    DocumentTooLargeError,
)
from models.errors import NotFoundError
from models.pagination import Page
from users.roles import find_builtin_role


@pytest.fixture
def document():
    now = datetime.now(UTC)
    return Document(
        id="a" * 16,
        name="Notice",
        filename="été.txt",
        media_type="text/plain",
        size=6,
        created_by="admin",
        created_at=now,
        updated_at=now,
        asset_ids=[],
        device_ids=[],
    )


@pytest.fixture
def context(document, admin_token_payload):
    svc = AsyncMock(spec=DocumentsService)
    svc.create.return_value = svc.get.return_value = svc.update.return_value = document
    svc.list.return_value = Page(items=[document], total=1, page=1, size=50)
    svc.get_content.return_value = DocumentContent(document, b"notice")
    assets = AsyncMock(spec=AssetsService)
    devices = MagicMock(spec=DevicesServiceInterface)
    app = FastAPI()
    app.include_router(router, prefix="/documents")
    register_exception_handlers(app)
    app.dependency_overrides[get_current_user_id] = lambda: "admin"
    app.dependency_overrides[get_current_token_payload] = lambda: admin_token_payload
    app.dependency_overrides[get_current_role] = lambda: find_builtin_role("admin")
    app.dependency_overrides[get_documents_service] = lambda: svc
    app.dependency_overrides[get_assets_service] = lambda: assets
    app.dependency_overrides[get_device_manager] = lambda: devices
    with TestClient(app) as client:
        yield client, svc, assets, devices


def upload(client, metadata=None, data=b"notice", name="été.txt"):
    return client.post(
        "/documents",
        data={
            "metadata": json.dumps(
                metadata if metadata is not None else {"name": "Notice"}
            )
        },
        files={"file": (name, data, "text/html")},
    )


def test_create_checks_references_and_returns_metadata(context):
    client, svc, assets, devices = context
    response = upload(
        client,
        {
            "name": "Notice",
            "asset_ids": ["building"],
            "device_ids": ["boiler"],
        },
    )
    assert response.status_code == 201
    assets.get_by_id.assert_awaited_once_with("building")
    devices.get_device.assert_called_once_with("boiler")
    assert svc.create.call_args.kwargs["data"] == b"notice"
    assert svc.create.call_args.kwargs["filename"] == "été.txt"


def test_lists_and_download_headers(context):
    client, svc, *_ = context
    response = client.get("/documents?q=chaud&asset_id=a&device_id=d&page=2&size=10")
    assert response.status_code == 200
    args = svc.list.call_args
    assert args.kwargs["filters"].q == "chaud"
    assert args.kwargs["pagination"].page == 2
    document = client.get("/documents/a")
    assert "content" not in document.json()
    content = client.get("/documents/a/content")
    assert content.content == b"notice"
    assert (
        content.headers["content-disposition"]
        == "attachment; filename*=UTF-8''%C3%A9t%C3%A9.txt"
    )
    assert content.headers["x-content-type-options"] == "nosniff"
    assert content.headers["cache-control"] == "private, no-store"


@pytest.mark.parametrize(
    "metadata",
    [
        {},
        {"name": ""},
        {"name": "x", "allowed_role_ids": ["unknown"]},
        {"name": "x", "unexpected": 1},
    ],
)
def test_rejects_invalid_metadata_before_storage(context, metadata):
    client, svc, *_ = context
    assert upload(client, metadata).status_code == 422
    svc.create.assert_not_awaited()


@pytest.mark.parametrize("kind", ["asset", "device"])
def test_invalid_links(context, kind):
    client, svc, assets, devices = context
    metadata: dict[str, object] = {"name": "Notice"}
    if kind == "asset":
        assets.get_by_id.side_effect = NotFoundError("private identifier")
        metadata["asset_ids"] = ["missing"]
    elif kind == "device":
        devices.get_device.side_effect = NotFoundError("private identifier")
        metadata["device_ids"] = ["missing"]
    response = upload(client, metadata)
    assert response.status_code == 422
    assert "private identifier" not in response.text
    svc.create.assert_not_awaited()


def test_partial_edit_does_not_revalidate_old_links(context):
    client, svc, assets, devices = context
    assert client.patch("/documents/a", json={"name": "New"}).status_code == 200
    assets.get_by_id.assert_not_awaited()
    devices.get_device.assert_not_called()
    assert svc.update.call_args.args[1].model_fields_set == {"name"}
    assert client.delete("/documents/a").status_code == 204


def test_service_size_error_is_413(context):
    client, svc, *_ = context
    svc.create.side_effect = DocumentTooLargeError("private details")
    response = upload(client)
    assert response.status_code == 413
    assert "private details" not in response.text


def test_file_size_and_wire_body_caps(context, monkeypatch):
    client, svc, *_ = context
    monkeypatch.setattr("api.document_upload.MAX_DOCUMENT_BYTES", 5)
    assert upload(client).status_code == 413
    monkeypatch.setattr("api.document_upload._BODY_BYTES", 10)
    assert upload(client).status_code == 413
    svc.create.assert_not_awaited()


def test_exact_limit_multiple_files_and_malformed_metadata(context, monkeypatch):
    client, svc, *_ = context
    monkeypatch.setattr("api.document_upload.MAX_DOCUMENT_BYTES", 6)
    assert upload(client).status_code == 201
    response = client.post(
        "/documents",
        files=[("file", ("a.txt", b"a")), ("file", ("b.txt", b"b"))],
        data={"metadata": "{}"},
    )
    assert response.status_code == 400
    response = client.post(
        "/documents", files={"file": ("a.txt", b"a")}, data={"metadata": "invalid JSON"}
    )
    assert response.status_code == 422
    assert client.post("/documents", data={"wrong": "value"}).status_code == 422
    assert svc.create.await_count == 1


def test_upload_policy_has_backend_limit_and_schema(context):
    client, *_ = context
    policy = client.get("/documents/upload-policy").json()
    assert policy["max_file_bytes"] == 100 * 1024 * 1024
    assert ".pdf" in policy["extensions"]
    assert policy["metadata_schema"]["required"] == ["name"]
