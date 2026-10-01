"""Integration tests for the postgres dashboards backend.

Runs the full ``DashboardsService`` against a real database so the JSONB
round-trip of widgets (and the registry-driven reconstruction of each widget's
concrete config) is exercised end-to-end. Opt-in via ``POSTGRES_TEST_URL``;
skipped when unset so the default suite stays hermetic.
"""

from __future__ import annotations

import contextlib
import os

import pytest
import pytest_asyncio
from dashboards.models import DashboardCreate, LayoutItem, WidgetPatch
from dashboards.service import DashboardsService

from models.errors import NotFoundError

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
        DashboardCreate(name="Ops", description="d", icon="gauge")
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

    # Summary listing excludes widgets and carries the icon.
    summaries = await svc.list()
    assert next(s for s in summaries.items if s.id == dashboard.id).icon == "gauge"
    assert fetched.icon == "gauge"

    # Envelope update persists.
    await svc.update_widget(dashboard.id, widget.id, WidgetPatch(description="desc"))
    assert (await svc.get(dashboard.id)).widgets[0].description == "desc"


async def test_delete_missing_raises_not_found(service):
    svc, _ = service

    with pytest.raises(NotFoundError):
        await svc.delete("does-not-exist")


async def test_order_persists_and_new_dashboards_go_last(service):
    svc, created = service
    a, b, c = [(await svc.create(DashboardCreate(name=n))).id for n in "abc"]
    created.extend([a, b, c])
    # The database is shared: every other dashboard stays first, in place.
    others = [s.id for s in (await svc.list()).items if s.id not in {a, b, c}]

    await svc.reorder([*others, c, a, b])
    d = (await svc.create(DashboardCreate(name="d"))).id
    created.append(d)

    ids = [s.id for s in (await svc.list()).items]
    assert ids == [*others, c, a, b, d]
