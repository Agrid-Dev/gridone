from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest
from dashboards import (
    Dashboard,
    DashboardsServiceInterface,
    DashboardSummary,
    Metadata,
    TextWidgetConfig,
    Widget,
    WidgetLayout,
)
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from api.dependencies import (
    get_current_token_payload,
    get_current_user_id,
    get_dashboards_service,
)
from api.exception_handlers import register_exception_handlers
from api.routes.dashboards_router import router
from models.errors import InvalidError, NotFoundError
from models.pagination import Page

pytestmark = pytest.mark.asyncio

_META = Metadata()
_WIDGET = Widget(
    id="w1",
    title="Note",
    description=None,
    config=TextWidgetConfig(text="hi", color="#1a2b3c"),
    layout=WidgetLayout(x=0, y=0, w=4, h=2),
    metadata=_META,
)
_DASHBOARD = Dashboard(
    id="d1", name="Ops", description="d", widgets=[_WIDGET], metadata=_META
)
_SUMMARY = DashboardSummary(id="d1", name="Ops", description="d", metadata=_META)

_TEXT_CONFIG = {"type": "text", "text": "hi", "color": "#1a2b3c"}


@pytest.fixture
def svc() -> AsyncMock:
    mock = AsyncMock(spec=DashboardsServiceInterface)
    mock.widget_schemas = MagicMock(return_value={"text": {"type": "object"}})
    return mock


@pytest.fixture
def app(svc, admin_token_payload) -> FastAPI:
    app = FastAPI()
    register_exception_handlers(app)
    app.include_router(router)
    app.dependency_overrides[get_dashboards_service] = lambda: svc
    app.dependency_overrides[get_current_token_payload] = lambda: admin_token_payload
    app.dependency_overrides[get_current_user_id] = lambda: admin_token_payload.sub
    return app


@pytest.fixture
def client(app) -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


class TestDashboardCrud:
    async def test_list_returns_summaries(self, client, svc):
        svc.list.return_value = Page(items=[_SUMMARY], total=1, page=1, size=1)
        async with client as c:
            resp = await c.get("/")
        assert resp.status_code == 200
        body = resp.json()
        assert body[0]["id"] == "d1"
        # Summaries carry no widgets/layout.
        assert "widgets" not in body[0]
        assert "layout" not in body[0]

    async def test_create_returns_201(self, client, svc):
        svc.create.return_value = _DASHBOARD
        async with client as c:
            resp = await c.post("/", json={"name": "Ops", "description": "d"})
        assert resp.status_code == 201
        assert resp.json()["id"] == "d1"

    async def test_create_rejects_extra_field(self, client):
        async with client as c:
            resp = await c.post("/", json={"name": "Ops", "bogus": 1})
        assert resp.status_code == 422

    async def test_get_returns_full_document(self, client, svc):
        svc.get.return_value = _DASHBOARD
        async with client as c:
            resp = await c.get("/d1")
        assert resp.status_code == 200
        body = resp.json()
        # Full document exposes widgets, each with a projected `type`,
        # and the derived react-grid-layout array.
        assert body["widgets"][0]["type"] == "text"
        assert body["layout"] == [{"i": "w1", "x": 0, "y": 0, "w": 4, "h": 2}]

    async def test_get_missing_returns_404(self, client, svc):
        svc.get.side_effect = NotFoundError("nope")
        async with client as c:
            resp = await c.get("/missing")
        assert resp.status_code == 404

    async def test_update_returns_dashboard(self, client, svc):
        svc.update.return_value = _DASHBOARD
        async with client as c:
            resp = await c.put("/d1", json={"name": "Renamed"})
        assert resp.status_code == 200
        svc.update.assert_awaited_once()

    async def test_delete_returns_204(self, client, svc):
        async with client as c:
            resp = await c.delete("/d1")
        assert resp.status_code == 204
        svc.delete.assert_awaited_once_with("d1")


class TestWidgets:
    async def test_add_widget_returns_201(self, client, svc):
        svc.add_widget.return_value = _WIDGET
        async with client as c:
            resp = await c.post(
                "/d1/widgets", json={"config": _TEXT_CONFIG, "title": "Note"}
            )
        assert resp.status_code == 201
        assert resp.json()["type"] == "text"
        svc.add_widget.assert_awaited_once_with(
            "d1", config=_TEXT_CONFIG, title="Note", description=None
        )

    async def test_add_widget_bad_color_returns_422_field_path(self, client, svc):
        async with client as c:
            resp = await c.post(
                "/d1/widgets",
                json={"config": {"type": "text", "text": "hi", "color": "red"}},
            )
        assert resp.status_code == 422
        # Field-level path points at the offending config field.
        locs = [d["loc"] for d in resp.json()["detail"]]
        assert any("color" in loc for loc in locs)
        svc.add_widget.assert_not_awaited()

    async def test_add_widget_unknown_type_returns_422(self, client):
        async with client as c:
            resp = await c.post("/d1/widgets", json={"config": {"type": "kpi"}})
        assert resp.status_code == 422

    async def test_update_widget_returns_widget(self, client, svc):
        svc.update_widget.return_value = _WIDGET
        async with client as c:
            resp = await c.put("/d1/widgets/w1", json={"title": "Renamed"})
        assert resp.status_code == 200
        svc.update_widget.assert_awaited_once()

    async def test_update_widget_type_change_rejected(self, client, svc):
        # The service enforces type immutability; a 4xx propagates as 422.
        svc.update_widget.side_effect = InvalidError("Cannot change widget type")
        async with client as c:
            resp = await c.put("/d1/widgets/w1", json={"config": _TEXT_CONFIG})
        assert resp.status_code == 422

    async def test_remove_widget_returns_204(self, client, svc):
        async with client as c:
            resp = await c.delete("/d1/widgets/w1")
        assert resp.status_code == 204
        svc.remove_widget.assert_awaited_once_with("d1", "w1")

    async def test_remove_missing_widget_returns_404(self, client, svc):
        svc.remove_widget.side_effect = NotFoundError("nope")
        async with client as c:
            resp = await c.delete("/d1/widgets/ghost")
        assert resp.status_code == 404


class TestLayout:
    async def test_update_layout_returns_dashboard(self, client, svc):
        svc.update_layout.return_value = _DASHBOARD
        async with client as c:
            resp = await c.put(
                "/d1/layout", json=[{"i": "w1", "x": 1, "y": 2, "w": 4, "h": 2}]
            )
        assert resp.status_code == 200
        svc.update_layout.assert_awaited_once()

    async def test_update_layout_rejects_bad_item(self, client):
        # w=0 violates the WidgetLayout ge=1 constraint at the boundary.
        async with client as c:
            resp = await c.put(
                "/d1/layout", json=[{"i": "w1", "x": 0, "y": 0, "w": 0, "h": 2}]
            )
        assert resp.status_code == 422


class TestWidgetSchemas:
    async def test_returns_schema_map(self, client):
        async with client as c:
            resp = await c.get("/widget-schemas")
        assert resp.status_code == 200
        assert "text" in resp.json()
