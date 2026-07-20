"""Service-level behavior tests for ``DashboardsService`` against the real
in-memory backend. These exercise the public API only — no storage internals,
no private attributes."""

from __future__ import annotations

from typing import Literal

import pytest
import pytest_asyncio
from dashboards.models import (
    Dashboard,
    DashboardCreate,
    DashboardPatch,
    LayoutItem,
    Widget,
    WidgetPatch,
)
from dashboards.service import DashboardsService
from dashboards.widgets import (
    TextWidgetConfig,
    WidgetConfig,
    WidgetSize,
    WidgetType,
    build_default_registry,
)

from models.errors import InvalidError, NotFoundError
from models.pagination import PaginationParams

pytestmark = pytest.mark.asyncio

TEXT_CONFIG = {"type": "text", "text": "hello", "color": "#1a2b3c"}


class _GaugeConfig(WidgetConfig):
    """A second widget type, registered only in tests to exercise behaviors
    (type immutability) that need more than one registered type."""

    type: Literal["gauge"] = "gauge"
    value: float


@pytest_asyncio.fixture
async def service():
    svc = DashboardsService(storage_url=None)
    await svc.start()
    try:
        yield svc
    finally:
        await svc.stop()


async def _dashboard_with_widget(
    service: DashboardsService, config: dict = TEXT_CONFIG
) -> tuple[Dashboard, Widget]:
    dashboard = await service.create(DashboardCreate(name="Ops"))
    widget = await service.add_widget(dashboard.id, config=config)
    return dashboard, widget


# ---------------------------------------------------------------------------
# Dashboard CRUD
# ---------------------------------------------------------------------------


async def test_create_stamps_id_and_timestamps(service: DashboardsService):
    dashboard = await service.create(DashboardCreate(name="Ops", description="d"))

    assert len(dashboard.id) == 16
    assert dashboard.name == "Ops"
    assert dashboard.description == "d"
    assert dashboard.widgets == []
    assert dashboard.metadata.updated_at >= dashboard.metadata.created_at


async def test_get_returns_full_document(service: DashboardsService):
    dashboard, widget = await _dashboard_with_widget(service)

    fetched = await service.get(dashboard.id)

    assert [w.id for w in fetched.widgets] == [widget.id]
    assert fetched.layout == [
        LayoutItem(i=widget.id, x=0, y=0, w=4, h=2),
    ]


async def test_get_missing_raises_not_found(service: DashboardsService):
    with pytest.raises(NotFoundError):
        await service.get("does-not-exist")


async def test_list_returns_summaries_without_widgets_or_layout(
    service: DashboardsService,
):
    await _dashboard_with_widget(service)

    page = await service.list()

    assert page.total == 1
    summary = page.items[0]
    assert not hasattr(summary, "widgets")
    assert not hasattr(summary, "layout")
    assert {"id", "name", "description", "metadata"} == set(summary.model_dump())


async def test_list_paginates(service: DashboardsService):
    for i in range(3):
        await service.create(DashboardCreate(name=f"d{i}"))

    page = await service.list(pagination=PaginationParams(page=1, size=2))

    assert page.total == 3
    assert len(page.items) == 2
    assert page.has_next


async def test_update_changes_name_and_description(service: DashboardsService):
    dashboard = await service.create(DashboardCreate(name="Ops", description="old"))

    updated = await service.update(
        dashboard.id, DashboardPatch(name="Ops 2", description="new")
    )

    assert updated.name == "Ops 2"
    assert updated.description == "new"
    assert updated.metadata.updated_at >= dashboard.metadata.updated_at


async def test_update_can_clear_description(service: DashboardsService):
    dashboard = await service.create(DashboardCreate(name="Ops", description="old"))

    updated = await service.update(dashboard.id, DashboardPatch(description=None))

    assert updated.description is None
    assert updated.name == "Ops"


async def test_update_omitted_fields_are_untouched(service: DashboardsService):
    dashboard = await service.create(DashboardCreate(name="Ops", description="keep"))

    updated = await service.update(dashboard.id, DashboardPatch(name="Renamed"))

    assert updated.description == "keep"


async def test_update_rejects_null_name(service: DashboardsService):
    dashboard = await service.create(DashboardCreate(name="Ops"))

    with pytest.raises(InvalidError):
        await service.update(dashboard.id, DashboardPatch(name=None))


async def test_update_missing_raises_not_found(service: DashboardsService):
    with pytest.raises(NotFoundError):
        await service.update("nope", DashboardPatch(name="x"))


async def test_delete_removes_dashboard(service: DashboardsService):
    dashboard = await service.create(DashboardCreate(name="Ops"))

    await service.delete(dashboard.id)

    with pytest.raises(NotFoundError):
        await service.get(dashboard.id)


async def test_delete_missing_raises_not_found(service: DashboardsService):
    with pytest.raises(NotFoundError):
        await service.delete("nope")


# ---------------------------------------------------------------------------
# Widgets
# ---------------------------------------------------------------------------


async def test_add_widget_returns_typed_widget(service: DashboardsService):
    _, widget = await _dashboard_with_widget(service)

    assert len(widget.id) == 16
    assert widget.type == "text"
    assert isinstance(widget.config, TextWidgetConfig)
    assert widget.config.text == "hello"
    assert widget.config.color == "#1a2b3c"


async def test_add_widget_places_at_bottom_with_default_size(
    service: DashboardsService,
):
    dashboard = await service.create(DashboardCreate(name="Ops"))

    first = await service.add_widget(dashboard.id, config=TEXT_CONFIG)
    second = await service.add_widget(dashboard.id, config=TEXT_CONFIG)

    assert (first.layout.x, first.layout.y, first.layout.w, first.layout.h) == (
        0,
        0,
        4,
        2,
    )
    # Second widget stacks below the first (y = first.y + first.h).
    assert (second.layout.x, second.layout.y) == (0, 2)


async def test_add_widget_rejects_unknown_type_and_persists_nothing(
    service: DashboardsService,
):
    dashboard = await service.create(DashboardCreate(name="Ops"))

    with pytest.raises(InvalidError):
        await service.add_widget(dashboard.id, config={"type": "nope", "x": 1})

    assert (await service.get(dashboard.id)).widgets == []


@pytest.mark.parametrize("color", ["red", "#12", "#abc", "1a2b3c", "#1a2b3g"])
async def test_add_widget_rejects_non_hex_color(service: DashboardsService, color: str):
    dashboard = await service.create(DashboardCreate(name="Ops"))

    with pytest.raises(InvalidError):
        await service.add_widget(
            dashboard.id, config={"type": "text", "text": "x", "color": color}
        )

    assert (await service.get(dashboard.id)).widgets == []


async def test_add_widget_rejects_extra_keys(service: DashboardsService):
    dashboard = await service.create(DashboardCreate(name="Ops"))

    with pytest.raises(InvalidError):
        await service.add_widget(
            dashboard.id,
            config={"type": "text", "text": "x", "color": "#1a2b3c", "bogus": 1},
        )


async def test_add_widget_missing_dashboard_raises_not_found(
    service: DashboardsService,
):
    with pytest.raises(NotFoundError):
        await service.add_widget("nope", config=TEXT_CONFIG)


async def test_update_widget_changes_envelope(service: DashboardsService):
    dashboard, widget = await _dashboard_with_widget(service)

    updated = await service.update_widget(
        dashboard.id, widget.id, WidgetPatch(title="Note", description="desc")
    )

    assert updated.title == "Note"
    assert updated.description == "desc"


async def test_update_widget_changes_config_same_type(service: DashboardsService):
    dashboard, widget = await _dashboard_with_widget(service)

    updated = await service.update_widget(
        dashboard.id,
        widget.id,
        WidgetPatch(config={"type": "text", "text": "bye", "color": "#ffffff"}),
    )

    assert isinstance(updated.config, TextWidgetConfig)
    assert updated.config.text == "bye"
    assert updated.config.color == "#ffffff"


async def test_update_widget_rejects_unknown_config_type(service: DashboardsService):
    dashboard, widget = await _dashboard_with_widget(service)

    with pytest.raises(InvalidError, match="Unknown widget type"):
        await service.update_widget(
            dashboard.id, widget.id, WidgetPatch(config={"type": "kpi"})
        )


async def test_update_widget_cannot_change_to_another_registered_type():
    # A second registered type is needed to reach the immutability guard: with
    # only one type, an unknown ``type`` is caught earlier by the registry.
    registry = build_default_registry()
    registry.register(
        WidgetType(
            type="gauge",
            config_model=_GaugeConfig,
            default_size=WidgetSize(w=2, h=2),
        )
    )
    svc = DashboardsService(storage_url=None, registry=registry)
    await svc.start()
    try:
        dashboard = await svc.create(DashboardCreate(name="Ops"))
        widget = await svc.add_widget(dashboard.id, config=TEXT_CONFIG)

        with pytest.raises(InvalidError, match="Cannot change widget type"):
            await svc.update_widget(
                dashboard.id,
                widget.id,
                WidgetPatch(config={"type": "gauge", "value": 1.0}),
            )
    finally:
        await svc.stop()


async def test_update_widget_missing_raises_not_found(service: DashboardsService):
    dashboard = await service.create(DashboardCreate(name="Ops"))

    with pytest.raises(NotFoundError):
        await service.update_widget(dashboard.id, "nope", WidgetPatch(title="x"))


async def test_remove_widget_removes_widget_and_layout_item(
    service: DashboardsService,
):
    dashboard, widget = await _dashboard_with_widget(service)

    await service.remove_widget(dashboard.id, widget.id)

    fetched = await service.get(dashboard.id)
    assert fetched.widgets == []
    assert fetched.layout == []


async def test_remove_widget_missing_raises_not_found(service: DashboardsService):
    dashboard = await service.create(DashboardCreate(name="Ops"))

    with pytest.raises(NotFoundError):
        await service.remove_widget(dashboard.id, "nope")


# ---------------------------------------------------------------------------
# Layout
# ---------------------------------------------------------------------------


async def test_update_layout_writes_geometry_onto_widgets(
    service: DashboardsService,
):
    dashboard, widget = await _dashboard_with_widget(service)

    updated = await service.update_layout(
        dashboard.id, [LayoutItem(i=widget.id, x=3, y=5, w=6, h=4)]
    )

    moved = updated.widgets[0]
    assert (moved.layout.x, moved.layout.y, moved.layout.w, moved.layout.h) == (
        3,
        5,
        6,
        4,
    )
    assert updated.layout == [LayoutItem(i=widget.id, x=3, y=5, w=6, h=4)]


async def test_update_layout_rejects_unknown_widget_id(service: DashboardsService):
    dashboard, _widget = await _dashboard_with_widget(service)

    with pytest.raises(InvalidError):
        await service.update_layout(
            dashboard.id, [LayoutItem(i="ghost", x=0, y=0, w=1, h=1)]
        )


async def test_update_layout_requires_one_item_per_widget(
    service: DashboardsService,
):
    dashboard, first = await _dashboard_with_widget(service)
    await service.add_widget(dashboard.id, config=TEXT_CONFIG)

    # Only one item for a two-widget dashboard.
    with pytest.raises(InvalidError):
        await service.update_layout(
            dashboard.id, [LayoutItem(i=first.id, x=0, y=0, w=1, h=1)]
        )


async def test_update_layout_rejects_duplicate_item(service: DashboardsService):
    dashboard, widget = await _dashboard_with_widget(service)

    with pytest.raises(InvalidError):
        await service.update_layout(
            dashboard.id,
            [
                LayoutItem(i=widget.id, x=0, y=0, w=1, h=1),
                LayoutItem(i=widget.id, x=1, y=1, w=1, h=1),
            ],
        )


# ---------------------------------------------------------------------------
# Widget schemas
# ---------------------------------------------------------------------------


async def test_widget_schemas_carry_hex_pattern(service: DashboardsService):
    schemas = service.widget_schemas()

    assert set(schemas) == {"text"}
    color = schemas["text"]["properties"]["color"]
    assert color["pattern"] == r"^#[0-9a-fA-F]{6}$"
