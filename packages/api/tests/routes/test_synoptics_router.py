from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from api.auth import get_current_token_payload, get_current_user_id
from api.dependencies import get_synoptics_service
from api.exception_handlers import register_exception_handlers
from api.routes.synoptics_router import router
from models.errors import (
    ConflictError,
    NotFoundError,
    SchemaValidationError,
    ValidationErrorItem,
)
from models.metadata import ResourceMetadata
from models.pagination import Page
from synoptics import Synoptic, SynopticsServiceInterface, SynopticSummary

pytestmark = pytest.mark.asyncio

_META = ResourceMetadata()
_TARGET = {"devices": {"ids": ["dev-1"]}, "attribute": "temperature"}
_DOCUMENT = {
    "name": "Plate",
    "symbols": [
        {
            "id": "b01",
            "type": "tank",
            "placement": {"kind": "cell", "cell": {"x": 0, "y": 0}},
            "bindings": {"temperature": {"kind": "attribute", "target": _TARGET}},
        }
    ],
    "pipes": [
        {
            "id": "supply",
            "fluid": "primary_supply",
            "from": {"kind": "port", "symbol": "b01", "port": "supply"},
            "to": {"kind": "cell", "cell": {"x": 4, "y": 0}},
            "flow": {"kind": "attribute", "target": _TARGET},
        }
    ],
}
_SYNOPTIC = Synoptic.model_validate({**_DOCUMENT, "id": "s1", "metadata": _META})
_SUMMARY = SynopticSummary(
    id="s1", name="Plate", projection="isometric", metadata=_META
)


@pytest.fixture
def svc() -> AsyncMock:
    mock = AsyncMock(spec=SynopticsServiceInterface)
    mock.symbol_schemas = MagicMock(return_value={"tank": {"type": "object"}})
    return mock


@pytest.fixture
def app(svc, admin_token_payload) -> FastAPI:
    app = FastAPI()
    register_exception_handlers(app)
    app.include_router(router)
    app.dependency_overrides[get_synoptics_service] = lambda: svc
    app.dependency_overrides[get_current_token_payload] = lambda: admin_token_payload
    app.dependency_overrides[get_current_user_id] = lambda: admin_token_payload.sub
    return app


@pytest.fixture
def client(app) -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


class TestRead:
    async def test_symbol_schemas_pass_through(self, client):
        async with client as c:
            resp = await c.get("/symbol-schemas")
        assert resp.status_code == 200
        assert resp.json() == {"tank": {"type": "object"}}

    async def test_list_is_paginated(self, client, svc):
        svc.list.return_value = Page(items=[_SUMMARY], total=1, page=1, size=20)
        async with client as c:
            resp = await c.get("/", params={"page": 1, "size": 20})
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 1
        assert body["items"][0]["id"] == "s1"
        assert "symbols" not in body["items"][0]
        assert svc.list.call_args.kwargs["pagination"].size == 20

    async def test_get_returns_the_stored_plate(self, client, svc):
        svc.get.return_value = _SYNOPTIC
        async with client as c:
            resp = await c.get("/s1")
        assert resp.status_code == 200
        body = resp.json()
        assert body["id"] == "s1"
        assert body["pipes"][0]["from"]["symbol"] == "b01"

    async def test_get_missing_returns_404(self, client, svc):
        svc.get.side_effect = NotFoundError("nope")
        async with client as c:
            resp = await c.get("/missing")
        assert resp.status_code == 404

    async def test_export_strips_the_envelope(self, client, svc):
        svc.get.return_value = _SYNOPTIC
        async with client as c:
            resp = await c.get("/s1/export")
        assert resp.status_code == 200
        body = resp.json()
        assert "id" not in body
        assert "metadata" not in body
        assert body["pipes"][0]["from"]["kind"] == "port"

    async def test_an_export_is_a_valid_create_payload(self, client, svc):
        svc.get.return_value = _SYNOPTIC
        svc.create.return_value = _SYNOPTIC
        async with client as c:
            exported = (await c.get("/s1/export")).json()
            resp = await c.post("/", json=exported)
        assert resp.status_code == 201


class TestWrite:
    async def test_create_returns_the_stored_plate(self, client, svc):
        svc.create.return_value = _SYNOPTIC
        async with client as c:
            resp = await c.post("/", json=_DOCUMENT)
        assert resp.status_code == 201
        assert resp.json()["id"] == "s1"

    async def test_create_rejects_extra_field(self, client, svc):
        async with client as c:
            resp = await c.post("/", json={**_DOCUMENT, "bogus": 1})
        assert resp.status_code == 422
        svc.create.assert_not_awaited()

    async def test_save_time_violations_keep_their_shape(self, client, svc):
        """The service's ``{loc, msg, type}`` items reach the client as-is, in
        the same envelope as request validation."""
        item = ValidationErrorItem(
            loc=("pipes", 0, "flow"), msg="nope", type="unresolved_target"
        )
        svc.create.side_effect = SchemaValidationError([item])
        async with client as c:
            resp = await c.post("/", json=_DOCUMENT)
        assert resp.status_code == 422
        errors = resp.json()["detail"]
        assert [(e["loc"], e["type"]) for e in errors] == [
            (["pipes", 0, "flow"], "unresolved_target")
        ]

    async def test_replace_forwards_expected_updated_at(self, client, svc):
        svc.replace.return_value = _SYNOPTIC
        seen = datetime(2026, 1, 1, tzinfo=UTC)
        async with client as c:
            resp = await c.put(
                "/s1",
                json=_DOCUMENT,
                params={"expected_updated_at": seen.isoformat()},
            )
        assert resp.status_code == 200
        assert svc.replace.call_args.kwargs["expected_updated_at"] == seen

    async def test_replace_refuses_a_naive_expectation(self, client, svc):
        async with client as c:
            resp = await c.put(
                "/s1",
                json=_DOCUMENT,
                params={"expected_updated_at": "2026-01-01T00:00:00"},
            )
        assert resp.status_code == 422
        svc.replace.assert_not_awaited()

    async def test_replace_without_expectation_skips_the_check(self, client, svc):
        svc.replace.return_value = _SYNOPTIC
        async with client as c:
            resp = await c.put("/s1", json=_DOCUMENT)
        assert resp.status_code == 200
        assert svc.replace.call_args.kwargs["expected_updated_at"] is None

    async def test_stale_replace_is_409(self, client, svc):
        svc.replace.side_effect = ConflictError("moved")
        async with client as c:
            resp = await c.put("/s1", json=_DOCUMENT)
        assert resp.status_code == 409

    async def test_delete_returns_204(self, client, svc):
        async with client as c:
            resp = await c.delete("/s1")
        assert resp.status_code == 204
        svc.delete.assert_awaited_once_with("s1")
