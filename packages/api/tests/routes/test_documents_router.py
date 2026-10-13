from datetime import UTC, datetime
from importlib import import_module
from unittest.mock import AsyncMock, MagicMock, call

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
    DocumentCreate,
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
        data=metadata if metadata is not None else {"name": "Notice"},
        files={"file": (name, data, "text/html")},
    )


def test_create_checks_references_and_returns_metadata(context, admin_token_payload):
    client, svc, assets, devices = context
    response = upload(
        client,
        {
            "name": "Notice",
            "asset_ids": ["building", "room"],
            "device_ids": ["boiler", "chiller"],
        },
    )
    assert response.status_code == 201, response.text
    assert assets.get_by_id.await_args_list == [
        call("building"),
        call("room"),
    ]
    assert devices.get_device.call_args_list == [call("boiler"), call("chiller")]
    assert svc.create.call_args.args[0] == DocumentCreate(
        name="Notice",
        asset_ids=["building", "room"],
        device_ids=["boiler", "chiller"],
    )
    assert svc.create.call_args.kwargs["data"] == b"notice"
    assert svc.create.call_args.kwargs["filename"] == "été.txt"
    assert svc.create.call_args.kwargs["created_by"] == admin_token_payload.sub


def test_create_defaults_links_and_trims_name(context):
    client, svc, *_ = context
    assert upload(client, {"name": "  Notice  "}).status_code == 201
    assert svc.create.call_args.args[0] == DocumentCreate(name="Notice")


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
        {"name": "   "},
        {"name": "x" * 256},
        {"name": "x", "asset_ids": ["x" * 129]},
        {"name": "x", "device_ids": ["x" * 129]},
        {"name": "x", "asset_ids": ["asset"] * 201},
        {"name": "x", "device_ids": ["device"] * 201},
    ],
)
def test_rejects_invalid_metadata_before_storage(context, metadata):
    client, svc, *_ = context
    response = upload(client, metadata)
    assert response.status_code == 422
    assert isinstance(response.json()["detail"], list)
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


def test_file_size_cap(context, monkeypatch):
    client, svc, *_ = context
    monkeypatch.setattr(
        import_module("api.routes.documents_router"), "MAX_DOCUMENT_BYTES", 5
    )
    assert upload(client).status_code == 413
    svc.create.assert_not_awaited()


def test_exact_limit(context, monkeypatch):
    client, svc, *_ = context
    monkeypatch.setattr(
        import_module("api.routes.documents_router"), "MAX_DOCUMENT_BYTES", 6
    )
    assert upload(client).status_code == 201
    assert svc.create.call_args.kwargs["data"] == b"notice"


def test_missing_file_and_legacy_metadata_are_rejected(context):
    client, svc, *_ = context
    assert client.post("/documents", data={"name": "Notice"}).status_code == 422
    response = client.post(
        "/documents",
        files={"file": ("a.txt", b"a")},
        data={"metadata": '{"name": "Notice"}'},
    )
    assert response.status_code == 422
    svc.create.assert_not_awaited()


def test_upload_policy_has_backend_limit_and_extensions(context):
    client, *_ = context
    policy = client.get("/documents/upload-policy").json()
    assert policy["max_file_bytes"] == 100 * 1024 * 1024
    assert ".pdf" in policy["extensions"]
    assert set(policy) == {"max_file_bytes", "extensions"}


def test_openapi_documents_typed_multipart_fields(context):
    client, *_ = context
    schema = client.get("/openapi.json").json()
    body = schema["paths"]["/documents"]["post"]["requestBody"]
    reference = body["content"]["multipart/form-data"]["schema"]["$ref"]
    fields = schema["components"]["schemas"][reference.rsplit("/", 1)[1]]
    assert set(fields["required"]) == {"file", "name"}
    assert set(fields["properties"]) == {"file", "name", "asset_ids", "device_ids"}
    assert (
        fields["properties"]["file"]["contentMediaType"] == "application/octet-stream"
    )
    name_reference = fields["properties"]["name"]["$ref"]
    name_schema = schema["components"]["schemas"][name_reference.rsplit("/", 1)[1]]
    assert name_schema["maxLength"] == 255
    assert fields["properties"]["asset_ids"]["type"] == "array"
    assert fields["properties"]["device_ids"]["maxItems"] == 200
