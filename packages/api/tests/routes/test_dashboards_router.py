from __future__ import annotations

from typing import get_args
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
    build_default_registry,
)
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from api.dependencies import (
    get_current_token_payload,
    get_current_user_id,
    get_dashboards_service,
    get_target_resolver,
)
from api.exception_handlers import register_exception_handlers
from api.routes.dashboards_router import router
from api.schemas.dashboard import WidgetConfigBody
from models.errors import InvalidError, NotFoundError
from models.pagination import Page
from models.targets import ResolvedTarget, TargetResolver
from models.types import DataType

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
_CHART_TARGET = {
    "devices": {"ids": ["dev1"], "types": None, "tags": None},
    "attribute": "temperature",
}
_CHART_CONFIG = {"type": "chart", "target": _CHART_TARGET}
_DEVICE_CONTROL_CONFIG = {"type": "device_control", "device_id": "dev1"}
_KPI_DEVICES = {"ids": ["dev1"], "types": None, "tags": None}
_KPI_ATTRIBUTE = {
    "label": "Temperature",
    "attribute": "temperature",
    "space_agg": None,
    "unit": None,
    "precision": None,
}
_KPI_CONFIG = {"type": "kpi", "devices": _KPI_DEVICES, "attributes": [_KPI_ATTRIBUTE]}


@pytest.fixture
def svc() -> AsyncMock:
    mock = AsyncMock(spec=DashboardsServiceInterface)
    mock.widget_schemas = MagicMock(return_value={"text": {"type": "object"}})
    return mock


@pytest.fixture
def mock_target_resolver() -> AsyncMock:
    resolver = AsyncMock(spec=TargetResolver)
    resolver.resolve.return_value = ResolvedTarget(
        attribute="temperature",
        device_ids=["dev1"],
        data_type=DataType.FLOAT,
        excluded_device_ids=[],
    )
    return resolver


@pytest.fixture
def app(svc, mock_target_resolver, admin_token_payload) -> FastAPI:
    app = FastAPI()
    register_exception_handlers(app)
    app.include_router(router)
    app.dependency_overrides[get_dashboards_service] = lambda: svc
    app.dependency_overrides[get_target_resolver] = lambda: mock_target_resolver
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
        # Full document exposes widgets, each with a projected `type`, its
        # concrete config fields, and the derived react-grid-layout array.
        widget = body["widgets"][0]
        assert widget["type"] == "text"
        assert widget["config"] == {"type": "text", "text": "hi", "color": "#1a2b3c"}
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
        body = resp.json()
        assert body["type"] == "text"
        # The concrete config fields must survive serialization, not just `type`.
        assert body["config"] == {"type": "text", "text": "hi", "color": "#1a2b3c"}
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

    async def test_add_chart_widget_reaches_the_service(self, client, svc):
        svc.add_widget.return_value = _WIDGET
        async with client as c:
            resp = await c.post("/d1/widgets", json={"config": _CHART_CONFIG})
        assert resp.status_code == 201
        # A body omitting `agg` reaches the service as an explicit raw chart.
        svc.add_widget.assert_awaited_once_with(
            "d1",
            config={**_CHART_CONFIG, "agg": None, "space_agg": None, "group_by": None},
            title=None,
            description=None,
        )

    async def test_add_aggregated_chart_widget_reaches_the_service(self, client, svc):
        svc.add_widget.return_value = _WIDGET
        config = {**_CHART_CONFIG, "agg": "avg"}
        async with client as c:
            resp = await c.post("/d1/widgets", json={"config": config})
        assert resp.status_code == 201
        svc.add_widget.assert_awaited_once_with(
            "d1",
            config={**config, "space_agg": None, "group_by": None},
            title=None,
            description=None,
        )

    async def test_add_chart_widget_unknown_operator_returns_422(self, client, svc):
        async with client as c:
            resp = await c.post(
                "/d1/widgets", json={"config": {**_CHART_CONFIG, "agg": "median"}}
            )
        assert resp.status_code == 422
        svc.add_widget.assert_not_awaited()

    async def test_add_chart_widget_missing_field_returns_422_field_path(
        self, client, svc
    ):
        # `type` discriminates, so the error names the missing chart field
        # instead of reporting every union member's complaints at once.
        async with client as c:
            resp = await c.post(
                "/d1/widgets", json={"config": {"type": "chart", "device_id": "dev1"}}
            )
        assert resp.status_code == 422
        locs = [d["loc"] for d in resp.json()["detail"]]
        assert any("attribute" in loc for loc in locs)
        assert not any("color" in loc for loc in locs)
        svc.add_widget.assert_not_awaited()

    async def test_add_legacy_chart_body_upgrades_to_target(self, client, svc):
        # The pre-target wire shape still validates: the boundary upgrades it
        # so the service only ever persists the target form.
        svc.add_widget.return_value = _WIDGET
        async with client as c:
            resp = await c.post(
                "/d1/widgets",
                json={
                    "config": {
                        "type": "chart",
                        "device_id": "dev1",
                        "attribute": "temperature",
                    }
                },
            )
        assert resp.status_code == 201
        config = svc.add_widget.await_args.kwargs["config"]
        assert config["target"] == _CHART_TARGET
        assert "device_id" not in config

    async def test_add_widget_with_unresolvable_target_returns_422(
        self, client, svc, mock_target_resolver
    ):
        # Save-time gate: zero coverage / mixed data types never persist.
        mock_target_resolver.resolve.side_effect = InvalidError(
            "No device in the target exposes 'temperature'"
        )
        async with client as c:
            resp = await c.post("/d1/widgets", json={"config": _CHART_CONFIG})
        assert resp.status_code == 422
        svc.add_widget.assert_not_awaited()

    async def test_add_text_widget_skips_target_resolution(
        self, client, svc, mock_target_resolver
    ):
        svc.add_widget.return_value = _WIDGET
        async with client as c:
            resp = await c.post("/d1/widgets", json={"config": _TEXT_CONFIG})
        assert resp.status_code == 201
        mock_target_resolver.resolve.assert_not_awaited()

    async def test_add_device_control_widget_reaches_the_service(
        self, client, svc, mock_target_resolver
    ):
        svc.add_widget.return_value = _WIDGET
        async with client as c:
            resp = await c.post("/d1/widgets", json={"config": _DEVICE_CONTROL_CONFIG})
        assert resp.status_code == 201
        svc.add_widget.assert_awaited_once_with(
            "d1", config=_DEVICE_CONTROL_CONFIG, title=None, description=None
        )
        # Target-free widget: nothing to resolve at save time.
        mock_target_resolver.resolve.assert_not_awaited()

    async def test_add_device_control_widget_missing_device_returns_422_field_path(
        self, client, svc
    ):
        async with client as c:
            resp = await c.post(
                "/d1/widgets", json={"config": {"type": "device_control"}}
            )
        assert resp.status_code == 422
        locs = [d["loc"] for d in resp.json()["detail"]]
        assert any("device_id" in loc for loc in locs)
        svc.add_widget.assert_not_awaited()

    async def test_update_widget_config_with_unresolvable_target_returns_422(
        self, client, svc, mock_target_resolver
    ):
        mock_target_resolver.resolve.side_effect = InvalidError("mixed data types")
        async with client as c:
            resp = await c.put("/d1/widgets/w1", json={"config": _CHART_CONFIG})
        assert resp.status_code == 422
        svc.update_widget.assert_not_awaited()

    async def test_add_live_kpi_widget_reaches_the_service(self, client, svc):
        svc.add_widget.return_value = _WIDGET
        async with client as c:
            resp = await c.post("/d1/widgets", json={"config": _KPI_CONFIG})
        assert resp.status_code == 201
        svc.add_widget.assert_awaited_once_with(
            "d1",
            config={
                "type": "kpi",
                "devices": _KPI_DEVICES,
                "attributes": [_KPI_ATTRIBUTE],
                "temporal": "live",
            },
            title=None,
            description=None,
        )

    async def test_add_period_kpi_widget_reaches_the_service(self, client, svc):
        svc.add_widget.return_value = _WIDGET
        config = {**_KPI_CONFIG, "temporal": {"operator": "sum"}}
        async with client as c:
            resp = await c.post("/d1/widgets", json={"config": config})
        assert resp.status_code == 201
        svc.add_widget.assert_awaited_once_with(
            "d1",
            config={
                "type": "kpi",
                "devices": _KPI_DEVICES,
                "attributes": [_KPI_ATTRIBUTE],
                "temporal": {"operator": "sum"},
            },
            title=None,
            description=None,
        )

    async def test_add_kpi_widget_with_multi_device_target_returns_422(
        self, client, svc, mock_target_resolver
    ):
        # v0 KPI tiles show one number: a target resolving to more than one
        # device is a save-time authoring error, not a render-time one.
        mock_target_resolver.resolve.return_value = ResolvedTarget(
            attribute="temperature",
            device_ids=["dev1", "dev2"],
            data_type=DataType.FLOAT,
            excluded_device_ids=[],
        )
        async with client as c:
            resp = await c.post("/d1/widgets", json={"config": _KPI_CONFIG})
        assert resp.status_code == 422
        svc.add_widget.assert_not_awaited()

    async def test_add_widget_unknown_type_returns_422(self, client):
        async with client as c:
            resp = await c.post("/d1/widgets", json={"config": {"type": "unknown"}})
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


async def test_widget_config_body_covers_every_registered_widget_type():
    """The request union must mirror the registry.

    ``WidgetConfigBody`` is spelled out by hand so FastAPI can discriminate on
    ``type`` and return a 422 naming the offending field. That makes it easy to
    register a widget in the service and forget it here — and the symptom is
    indirect: saving the widget 422s, and its config never reaches OpenAPI, so
    the generated SDK has no type for it either.
    """
    union_types = {
        member.model_fields["type"].default
        for member in get_args(get_args(WidgetConfigBody)[0])
    }

    assert union_types == set(build_default_registry().types())
