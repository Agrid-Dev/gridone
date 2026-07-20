"""Unit tests for the in-memory storage backend's edge cases.

The happy paths are covered end-to-end through the service; here we pin the
backend's own error contract and isolation guarantees.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from dashboards.models import Dashboard, Metadata
from dashboards.storage.memory import MemoryStorage

from models.errors import NotFoundError

pytestmark = pytest.mark.asyncio


def _dashboard(dashboard_id: str = "d1", name: str = "Ops") -> Dashboard:
    now = datetime(2026, 1, 2, tzinfo=UTC)
    return Dashboard(
        id=dashboard_id,
        name=name,
        metadata=Metadata(created_at=now, updated_at=now),
    )


async def test_update_missing_raises_not_found():
    storage = MemoryStorage()

    with pytest.raises(NotFoundError):
        await storage.update(_dashboard())


async def test_delete_missing_raises_not_found():
    storage = MemoryStorage()

    with pytest.raises(NotFoundError):
        await storage.delete("nope")


async def test_get_returns_isolated_copy():
    storage = MemoryStorage()
    await storage.create(_dashboard())

    fetched = await storage.get("d1")
    assert fetched is not None
    fetched.name = "mutated"

    reread = await storage.get("d1")
    assert reread is not None
    assert reread.name == "Ops"


async def test_list_summaries_orders_by_created_at():
    storage = MemoryStorage()
    older = _dashboard("old")
    older.metadata.created_at = datetime(2026, 1, 1, tzinfo=UTC)
    newer = _dashboard("new")
    newer.metadata.created_at = datetime(2026, 2, 1, tzinfo=UTC)
    await storage.create(newer)
    await storage.create(older)

    summaries = await storage.list_summaries()

    assert [s.id for s in summaries] == ["old", "new"]
