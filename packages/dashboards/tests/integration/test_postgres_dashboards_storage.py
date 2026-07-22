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

    dashboard = await svc.create(DashboardCreate(name="Ops", description="d"))
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

    # Summary listing excludes widgets.
    summaries = await svc.list()
    assert any(s.id == dashboard.id for s in summaries.items)

    # Envelope update persists.
    await svc.update_widget(dashboard.id, widget.id, WidgetPatch(description="desc"))
    assert (await svc.get(dashboard.id)).widgets[0].description == "desc"


async def test_delete_missing_raises_not_found(service):
    svc, _ = service

    with pytest.raises(NotFoundError):
        await svc.delete("does-not-exist")
