"""Integration tests for the postgres dashboards backend.

Runs the full ``DashboardsService`` against a real database so the JSONB
round-trip of widgets (and the registry-driven reconstruction of each widget's
concrete config) is exercised end-to-end. Opt-in via ``POSTGRES_TEST_URL``;
skipped when unset so the default suite stays hermetic.
"""

from __future__ import annotations

import contextlib
import os
from typing import Literal

import pytest
import pytest_asyncio
from dashboards.models import DashboardCreate, LayoutItem, WidgetPatch
from dashboards.service import DashboardsService
from dashboards.widgets import (
    InvalidWidgetConfig,
    WidgetConfig,
    WidgetSize,
    WidgetType,
    build_default_registry,
)
from dashboards.widgets.registry import ANY_DASHBOARD

from models.errors import InvalidError, NotFoundError

POSTGRES_URL = os.environ.get("POSTGRES_TEST_URL")

pytestmark = [
    pytest.mark.asyncio,
    pytest.mark.integration,
    pytest.mark.skipif(POSTGRES_URL is None, reason="POSTGRES_TEST_URL not set"),
]

TEXT_CONFIG = {"type": "text", "text": "hello", "color": "#1a2b3c"}


@pytest_asyncio.fixture
async def service():
    svc = DashboardsService(storage_url=POSTGRES_URL)
    await svc.start()
    created: list[str] = []
    try:
        yield svc, created
    finally:
        for dashboard_id in created:
            with contextlib.suppress(NotFoundError):
                await svc.delete(dashboard_id)
        await svc.stop()


async def test_golden_path_round_trips_through_postgres(service):
    svc, created = service

    dashboard = await svc.create(
        DashboardCreate(type="history", name="Ops", description="d", icon="gauge")
    )
    created.append(dashboard.id)

    widget = await svc.add_widget(dashboard.id, config=TEXT_CONFIG, title="Note")
    await svc.update_layout(dashboard.id, [LayoutItem(i=widget.id, x=2, y=3, w=6, h=4)])

    # Re-read: config must come back as the concrete TextWidgetConfig with its
    # type-specific fields intact, and geometry must survive the JSONB trip.
    fetched = await svc.get(dashboard.id)
    reloaded = fetched.widgets[0]
    assert reloaded.type == "text"
    assert reloaded.config.text == "hello"
    assert reloaded.config.color == "#1a2b3c"
    assert reloaded.title == "Note"
    assert (reloaded.layout.x, reloaded.layout.y, reloaded.layout.w) == (2, 3, 6)

    # Summary listing excludes widgets and carries the icon and type.
    summaries = await svc.list()
    summary = next(s for s in summaries.items if s.id == dashboard.id)
    assert summary.icon == "gauge"
    assert summary.type == "history"
    assert fetched.type == "history"

    # Envelope update persists.
    await svc.update_widget(dashboard.id, widget.id, WidgetPatch(description="desc"))
    assert (await svc.get(dashboard.id)).widgets[0].description == "desc"


async def test_delete_missing_raises_not_found(service):
    svc, _ = service

    with pytest.raises(NotFoundError):
        await svc.delete("does-not-exist")


async def test_order_persists_and_new_dashboards_go_last(service):
    svc, created = service
    a, b, c = [
        (await svc.create(DashboardCreate(type="live", name=n))).id for n in "abc"
    ]
    created.extend([a, b, c])
    # The database is shared: every other dashboard stays first, in place.
    others = [s.id for s in (await svc.list()).items if s.id not in {a, b, c}]

    await svc.reorder([*others, c, a, b])
    d = (await svc.create(DashboardCreate(type="live", name="d"))).id
    created.append(d)

    ids = [s.id for s in (await svc.list()).items]
    assert ids == [*others, c, a, b, d]


class _GaugeConfig(WidgetConfig):
    """A widget type only one of the two services below knows: stands in for
    a type (or shape) a later build dropped from the registry."""

    type: Literal["gauge"] = "gauge"
    value: float


async def _service_knowing_gauge(
    dashboard_types: frozenset[str] = ANY_DASHBOARD,
) -> DashboardsService:
    registry = build_default_registry()
    registry.register(
        WidgetType(
            type="gauge",
            config_model=_GaugeConfig,
            default_size=WidgetSize(w=2, h=2),
            dashboard_types=dashboard_types,  # type: ignore[arg-type]
        )
    )
    svc = DashboardsService(storage_url=POSTGRES_URL, registry=registry)
    await svc.start()
    return svc


async def test_a_widget_this_build_no_longer_knows_is_flagged_not_fatal(service):
    # Written by a build that knew ``gauge``; read by one that does not. The
    # dashboard still reads, its other widgets render, the stale widget keeps
    # its raw config through a sibling's edit and can be removed.
    svc, created = service
    writer = await _service_knowing_gauge()
    try:
        dashboard = await writer.create(DashboardCreate(type="live", name="Ops"))
        created.append(dashboard.id)
        gauge = await writer.add_widget(
            dashboard.id, config={"type": "gauge", "value": 1.5}, title="Gauge"
        )
        text = await writer.add_widget(dashboard.id, config=TEXT_CONFIG)
    finally:
        await writer.stop()

    fetched = await svc.get(dashboard.id)
    stale, fine = fetched.widgets
    assert stale.id == gauge.id
    assert stale.error == "invalid_config"
    assert isinstance(stale.config, InvalidWidgetConfig)
    assert stale.config.model_dump() == {"type": "gauge", "value": 1.5}
    assert fine.error is None

    # A sibling's edit rewrites the whole document: the stale widget survives it
    # verbatim, and the envelope of the stale widget itself stays editable.
    await svc.update_widget(dashboard.id, text.id, WidgetPatch(title="Note"))
    await svc.update_widget(dashboard.id, gauge.id, WidgetPatch(title="Old gauge"))
    stale = (await svc.get(dashboard.id)).widgets[0]
    assert stale.config.model_dump() == {"type": "gauge", "value": 1.5}
    assert stale.title == "Old gauge"
    assert stale.error == "invalid_config"

    await svc.remove_widget(dashboard.id, gauge.id)
    assert [w.id for w in (await svc.get(dashboard.id)).widgets] == [text.id]


async def test_a_widget_that_no_longer_fits_its_dashboard_is_flagged_not_fatal(
    service,
):
    # Placed while ``gauge`` fit any dashboard; read by a build where it is
    # live-only. Flagged on read, kept through layout edits, refused a config
    # edit (remove + add elsewhere is the way out), still removable.
    _, created = service
    placer = await _service_knowing_gauge()
    try:
        dashboard = await placer.create(DashboardCreate(type="history", name="Ops"))
        created.append(dashboard.id)
        gauge = await placer.add_widget(
            dashboard.id, config={"type": "gauge", "value": 1.0}
        )
    finally:
        await placer.stop()

    reader = await _service_knowing_gauge(frozenset({"live"}))
    try:
        fetched = await reader.get(dashboard.id)
        assert fetched.widgets[0].error == "incompatible_type"

        laid_out = await reader.update_layout(
            dashboard.id, [LayoutItem(i=gauge.id, x=1, y=1, w=2, h=2)]
        )
        assert laid_out.widgets[0].error == "incompatible_type"

        with pytest.raises(InvalidError, match="not allowed on a history"):
            await reader.update_widget(
                dashboard.id,
                gauge.id,
                WidgetPatch(config={"type": "gauge", "value": 2.0}),
            )

        await reader.remove_widget(dashboard.id, gauge.id)
        assert (await reader.get(dashboard.id)).widgets == []
    finally:
        await reader.stop()
