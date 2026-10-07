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
from dashboards.widgets.registry import ANY_DASHBOARD

from models.errors import InvalidError, NotFoundError
from models.pagination import PaginationParams

pytestmark = pytest.mark.asyncio

TEXT_CONFIG = {"type": "text", "text": "hello", "color": "#1a2b3c"}


def _kpi_config(attribute_count: int) -> dict:
    return {
        "type": "kpi_live",
        "devices": {"ids": ["d0"]},
        "attributes": [
            {"label": f"Attribute {i}", "attribute": f"attr{i}"}
            for i in range(attribute_count)
        ],
    }


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
    dashboard = await service.create(DashboardCreate(type="live", name="Ops"))
    widget = await service.add_widget(dashboard.id, config=config)
    return dashboard, widget


# ---------------------------------------------------------------------------
# Dashboard CRUD
# ---------------------------------------------------------------------------


async def test_create_stamps_id_and_timestamps(service: DashboardsService):
    dashboard = await service.create(
        DashboardCreate(type="live", name="Ops", description="d")
    )

    assert len(dashboard.id) == 16
    assert dashboard.name == "Ops"
    assert dashboard.description == "d"
    assert dashboard.widgets == []
    assert dashboard.icon is None
    assert dashboard.metadata.updated_at >= dashboard.metadata.created_at


async def test_create_keeps_the_icon_and_lists_it(service: DashboardsService):
    dashboard = await service.create(
        DashboardCreate(type="live", name="ECS", icon="droplets")
    )

    assert dashboard.icon == "droplets"
    assert (await service.get(dashboard.id)).icon == "droplets"
    assert (await service.list()).items[0].icon == "droplets"


@pytest.mark.parametrize("type_", ["live", "history"])
async def test_create_keeps_the_type_and_lists_it(
    service: DashboardsService, type_: str
):
    dashboard = await service.create(DashboardCreate(type=type_, name="Ops"))

    assert dashboard.type == type_
    assert (await service.get(dashboard.id)).type == type_
    assert (await service.list()).items[0].type == type_


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
    assert {"id", "name", "type", "description", "icon", "metadata"} == set(
        summary.model_dump()
    )


async def test_list_paginates(service: DashboardsService):
    for i in range(3):
        await service.create(DashboardCreate(type="live", name=f"d{i}"))

    page = await service.list(pagination=PaginationParams(page=1, size=2))

    assert page.total == 3
    assert len(page.items) == 2
    assert page.has_next


async def test_update_changes_name_and_description(service: DashboardsService):
    dashboard = await service.create(
        DashboardCreate(type="live", name="Ops", description="old")
    )

    updated = await service.update(
        dashboard.id, DashboardPatch(name="Ops 2", description="new")
    )

    assert updated.name == "Ops 2"
    assert updated.description == "new"
    assert updated.metadata.updated_at >= dashboard.metadata.updated_at


async def test_update_can_clear_description(service: DashboardsService):
    dashboard = await service.create(
        DashboardCreate(type="live", name="Ops", description="old")
    )

    updated = await service.update(dashboard.id, DashboardPatch(description=None))

    assert updated.description is None
    assert updated.name == "Ops"


async def test_update_omitted_fields_are_untouched(service: DashboardsService):
    dashboard = await service.create(
        DashboardCreate(type="live", name="Ops", description="keep")
    )

    updated = await service.update(dashboard.id, DashboardPatch(name="Renamed"))

    assert updated.description == "keep"


async def test_update_sets_and_clears_the_icon(service: DashboardsService):
    dashboard = await service.create(DashboardCreate(type="live", name="Ops"))

    updated = await service.update(dashboard.id, DashboardPatch(icon="fan"))
    assert updated.icon == "fan"

    untouched = await service.update(dashboard.id, DashboardPatch(name="Ops 2"))
    assert untouched.icon == "fan"

    cleared = await service.update(dashboard.id, DashboardPatch(icon=None))
    assert cleared.icon is None


async def test_update_rejects_null_name(service: DashboardsService):
    dashboard = await service.create(DashboardCreate(type="live", name="Ops"))

    with pytest.raises(InvalidError):
        await service.update(dashboard.id, DashboardPatch(name=None))


async def test_update_missing_raises_not_found(service: DashboardsService):
    with pytest.raises(NotFoundError):
        await service.update("nope", DashboardPatch(name="x"))


async def test_delete_removes_dashboard(service: DashboardsService):
    dashboard = await service.create(DashboardCreate(type="live", name="Ops"))

    await service.delete(dashboard.id)

    with pytest.raises(NotFoundError):
        await service.get(dashboard.id)


async def test_delete_missing_raises_not_found(service: DashboardsService):
    with pytest.raises(NotFoundError):
        await service.delete("nope")


# ---------------------------------------------------------------------------
# Order
# ---------------------------------------------------------------------------


async def _listed_ids(service: DashboardsService) -> list[str]:
    return [s.id for s in (await service.list()).items]


async def _create_many(service: DashboardsService, count: int) -> list[str]:
    return [
        (await service.create(DashboardCreate(type="live", name=f"d{i}"))).id
        for i in range(count)
    ]


async def test_list_defaults_to_creation_order(service: DashboardsService):
    ids = await _create_many(service, 3)

    assert await _listed_ids(service) == ids


async def test_reorder_sets_list_order(service: DashboardsService):
    a, b, c = await _create_many(service, 3)

    await service.reorder([c, a, b])

    assert await _listed_ids(service) == [c, a, b]


async def test_reorder_applies_to_paginated_list(service: DashboardsService):
    a, b, c = await _create_many(service, 3)
    await service.reorder([c, a, b])

    page = await service.list(pagination=PaginationParams(page=1, size=2))

    assert [s.id for s in page.items] == [c, a]


async def test_created_dashboard_goes_last(service: DashboardsService):
    a, b = await _create_many(service, 2)
    await service.reorder([b, a])

    c = (await service.create(DashboardCreate(type="live", name="c"))).id

    assert await _listed_ids(service) == [b, a, c]


async def test_delete_keeps_remaining_order(service: DashboardsService):
    a, b, c = await _create_many(service, 3)
    await service.reorder([c, a, b])

    await service.delete(a)

    assert await _listed_ids(service) == [c, b]


async def test_update_keeps_order(service: DashboardsService):
    a, b = await _create_many(service, 2)
    await service.reorder([b, a])

    await service.update(b, DashboardPatch(name="renamed"))

    assert await _listed_ids(service) == [b, a]


@pytest.mark.parametrize(
    "order",
    [
        pytest.param(["a", "a", "b"], id="duplicate"),
        pytest.param(["a"], id="missing"),
        pytest.param(["a", "b", "unknown"], id="unknown"),
        pytest.param([], id="empty"),
    ],
)
async def test_reorder_rejects_non_permutation(
    service: DashboardsService, order: list[str]
):
    a, b = await _create_many(service, 2)
    ids = {"a": a, "b": b}

    with pytest.raises(InvalidError):
        await service.reorder([ids.get(key, key) for key in order])

    assert await _listed_ids(service) == [a, b]


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
    dashboard = await service.create(DashboardCreate(type="live", name="Ops"))

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


async def test_add_widget_kpi_grows_height_for_its_attribute_count(
    service: DashboardsService,
):
    dashboard = await service.create(DashboardCreate(type="live", name="Ops"))

    widget = await service.add_widget(dashboard.id, config=_kpi_config(3))

    assert (widget.layout.w, widget.layout.h) == (2, 3)


async def test_add_widget_kpi_single_attribute_keeps_default_height(
    service: DashboardsService,
):
    dashboard = await service.create(DashboardCreate(type="live", name="Ops"))

    widget = await service.add_widget(dashboard.id, config=_kpi_config(1))

    assert (widget.layout.w, widget.layout.h) == (2, 1)


async def test_add_widget_rejects_unknown_type_and_persists_nothing(
    service: DashboardsService,
):
    dashboard = await service.create(DashboardCreate(type="live", name="Ops"))

    with pytest.raises(InvalidError):
        await service.add_widget(dashboard.id, config={"type": "nope", "x": 1})

    assert (await service.get(dashboard.id)).widgets == []


@pytest.mark.parametrize("color", ["red", "#12", "#abc", "1a2b3c", "#1a2b3g"])
async def test_add_widget_rejects_non_hex_color(service: DashboardsService, color: str):
    dashboard = await service.create(DashboardCreate(type="live", name="Ops"))

    with pytest.raises(InvalidError):
        await service.add_widget(
            dashboard.id, config={"type": "text", "text": "x", "color": color}
        )

    assert (await service.get(dashboard.id)).widgets == []


async def test_add_widget_rejects_extra_keys(service: DashboardsService):
    dashboard = await service.create(DashboardCreate(type="live", name="Ops"))

    with pytest.raises(InvalidError):
        await service.add_widget(
            dashboard.id,
            config={"type": "text", "text": "x", "color": "#1a2b3c", "bogus": 1},
        )


CHART_CONFIG = {
    "type": "chart",
    "targets": [{"devices": {"ids": ["d0"]}, "attribute": "power"}],
}
CONTROL_PANEL_CONFIG = {
    "type": "control_panel",
    "sections": [{"attributes": [{"device_id": "d0", "attribute": "enabled"}]}],
}


@pytest.mark.parametrize(
    ("dashboard_type", "config", "fits"),
    [
        ("live", CONTROL_PANEL_CONFIG, True),
        ("live", CHART_CONFIG, False),
        ("live", TEXT_CONFIG, True),
        ("history", CHART_CONFIG, True),
        ("history", CONTROL_PANEL_CONFIG, False),
        ("history", TEXT_CONFIG, True),
    ],
    ids=[
        "live_takes_live",
        "live_refuses_history",
        "live_takes_text",
        "history_takes_history",
        "history_refuses_live",
        "history_takes_text",
    ],
)
async def test_add_widget_enforces_the_dashboard_type_fit(
    service: DashboardsService, dashboard_type: str, config: dict, fits: bool
):
    dashboard = await service.create(DashboardCreate(type=dashboard_type, name="Ops"))

    if fits:
        widget = await service.add_widget(dashboard.id, config=config)
        assert widget.error is None
    else:
        with pytest.raises(InvalidError, match="not allowed on a"):
            await service.add_widget(dashboard.id, config=config)
        assert (await service.get(dashboard.id)).widgets == []


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


async def test_update_widget_kpi_grows_layout_for_added_attributes(
    service: DashboardsService,
):
    dashboard, widget = await _dashboard_with_widget(service, _kpi_config(1))
    assert widget.layout.h == 1

    updated = await service.update_widget(
        dashboard.id, widget.id, WidgetPatch(config=_kpi_config(3))
    )

    assert (updated.layout.x, updated.layout.y) == (widget.layout.x, widget.layout.y)
    assert (updated.layout.w, updated.layout.h) == (2, 3)


async def test_update_widget_kpi_does_not_shrink_layout_on_fewer_attributes(
    service: DashboardsService,
):
    dashboard, widget = await _dashboard_with_widget(service, _kpi_config(3))
    assert widget.layout.h == 3

    updated = await service.update_widget(
        dashboard.id, widget.id, WidgetPatch(config=_kpi_config(1))
    )

    assert updated.layout.h == 3


async def test_update_widget_does_not_regrow_a_manually_shrunk_non_kpi_widget(
    service: DashboardsService,
):
    # text's registry default is 4x2; shrinking it below that and then
    # editing an unrelated field must not snap it back to the default —
    # only content-dependent types (kpi) grow past their current size.
    dashboard, widget = await _dashboard_with_widget(service)
    assert (widget.layout.w, widget.layout.h) == (4, 2)
    await service.update_layout(
        dashboard.id,
        [LayoutItem(i=widget.id, x=0, y=0, w=2, h=1)],
    )

    updated = await service.update_widget(
        dashboard.id,
        widget.id,
        WidgetPatch(config={"type": "text", "text": "bye", "color": "#ffffff"}),
    )

    assert (updated.layout.w, updated.layout.h) == (2, 1)


async def test_update_widget_rejects_unknown_config_type(service: DashboardsService):
    dashboard, widget = await _dashboard_with_widget(service)

    with pytest.raises(InvalidError, match="Unknown widget type"):
        await service.update_widget(
            dashboard.id, widget.id, WidgetPatch(config={"type": "unknown"})
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
            dashboard_types=ANY_DASHBOARD,
        )
    )
    svc = DashboardsService(storage_url=None, registry=registry)
    await svc.start()
    try:
        dashboard = await svc.create(DashboardCreate(type="live", name="Ops"))
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
    dashboard = await service.create(DashboardCreate(type="live", name="Ops"))

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
    dashboard = await service.create(DashboardCreate(type="live", name="Ops"))

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

    assert set(schemas) == {
        "text",
        "chart",
        "device_control",
        "kpi_live",
        "kpi_history",
        "meter_tree",
        "control_panel",
        "synoptic",
    }
    color = schemas["text"]["properties"]["color"]
    assert color["pattern"] == r"^#[0-9a-fA-F]{6}$"
