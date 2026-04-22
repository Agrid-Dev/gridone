from __future__ import annotations

import os
from datetime import UTC, datetime
from uuid import uuid4

import pytest
import pytest_asyncio
from automations.models import (
    Automation,
    AutomationExecution,
    ChangeEventTrigger,
    ExecutionStatus,
    ScheduleTrigger,
)
from automations.storage.postgres import PostgresStorage

from models.errors import NotFoundError

POSTGRES_URL = os.environ.get("POSTGRES_TEST_URL")

pytestmark = [
    pytest.mark.asyncio,
    pytest.mark.integration,
    pytest.mark.skipif(POSTGRES_URL is None, reason="POSTGRES_TEST_URL not set"),
]

_SCHEDULE = ScheduleTrigger(cron="0 11 * * *")
_CHANGE = ChangeEventTrigger(source_id="src-01", event_type="temperature")


def _automation(**kwargs: object) -> Automation:
    defaults: dict[str, object] = {
        "id": uuid4().hex[:16],
        "name": "test-auto",
        "trigger": _SCHEDULE,
        "action_template_id": "tmpl-01",
        "enabled": True,
    }
    return Automation(**{**defaults, **kwargs})  # type: ignore[arg-type]


def _execution(automation_id: str, **kwargs: object) -> AutomationExecution:
    defaults: dict[str, object] = {
        "id": uuid4().hex[:16],
        "automation_id": automation_id,
        "triggered_at": datetime(2024, 1, 1, tzinfo=UTC),
        "status": ExecutionStatus.SUCCESS,
    }
    return AutomationExecution(**{**defaults, **kwargs})  # type: ignore[arg-type]


@pytest_asyncio.fixture
async def storage():
    assert POSTGRES_URL is not None
    store = await PostgresStorage.from_url(POSTGRES_URL)
    await store.start()
    async with store._pool.acquire() as conn:
        await conn.execute("DELETE FROM automations")  # cascades to executions
    yield store
    await store.close()


class TestCRUD:
    async def test_create_get_roundtrip(self, storage: PostgresStorage):
        auto = _automation()
        await storage.create(auto)
        fetched = await storage.get(auto.id)
        assert fetched.id == auto.id
        assert fetched.name == auto.name
        assert fetched.action_template_id == auto.action_template_id
        assert fetched.enabled == auto.enabled

    async def test_get_raises_not_found(self, storage: PostgresStorage):
        with pytest.raises(NotFoundError):
            await storage.get("nonexistent")

    async def test_list_all(self, storage: PostgresStorage):
        a1 = _automation(name="a1", enabled=True)
        a2 = _automation(name="a2", enabled=False)
        await storage.create(a1)
        await storage.create(a2)
        ids = {a.id for a in await storage.list()}
        assert {a1.id, a2.id} == ids

    async def test_list_enabled_filter(self, storage: PostgresStorage):
        a1 = _automation(name="enabled", enabled=True)
        a2 = _automation(name="disabled", enabled=False)
        await storage.create(a1)
        await storage.create(a2)
        enabled = await storage.list(enabled=True)
        assert all(a.enabled for a in enabled)
        assert a1.id in {a.id for a in enabled}
        assert a2.id not in {a.id for a in enabled}

    async def test_update(self, storage: PostgresStorage):
        auto = _automation(name="original")
        await storage.create(auto)
        updated = Automation(
            id=auto.id,
            name="renamed",
            trigger=_CHANGE,
            action_template_id="tmpl-new",
            enabled=False,
        )
        await storage.update(updated)
        fetched = await storage.get(auto.id)
        assert fetched.name == "renamed"
        assert fetched.enabled is False

    async def test_update_raises_not_found(self, storage: PostgresStorage):
        with pytest.raises(NotFoundError):
            await storage.update(_automation(id="missing"))

    async def test_delete(self, storage: PostgresStorage):
        auto = _automation()
        await storage.create(auto)
        await storage.delete(auto.id)
        with pytest.raises(NotFoundError):
            await storage.get(auto.id)

    async def test_delete_raises_not_found(self, storage: PostgresStorage):
        with pytest.raises(NotFoundError):
            await storage.delete("nonexistent")


class TestTriggerJSONB:
    async def test_schedule_trigger_roundtrip(self, storage: PostgresStorage):
        auto = _automation(trigger=ScheduleTrigger(cron="30 8 * * 1-5"))
        await storage.create(auto)
        fetched = await storage.get(auto.id)
        assert isinstance(fetched.trigger, ScheduleTrigger)
        assert fetched.trigger.cron == "30 8 * * 1-5"

    async def test_change_event_trigger_roundtrip(self, storage: PostgresStorage):
        auto = _automation(
            trigger=ChangeEventTrigger(source_id="dev-1", event_type="mode")
        )
        await storage.create(auto)
        fetched = await storage.get(auto.id)
        assert isinstance(fetched.trigger, ChangeEventTrigger)
        assert fetched.trigger.source_id == "dev-1"
        assert fetched.trigger.event_type == "mode"


class TestExecutions:
    async def test_log_and_list(self, storage: PostgresStorage):
        auto = _automation()
        await storage.create(auto)
        e = _execution(auto.id)
        await storage.log_execution(e)
        results = await storage.list_executions(auto.id)
        assert len(results) == 1
        assert results[0].id == e.id

    async def test_list_newest_first(self, storage: PostgresStorage):
        auto = _automation()
        await storage.create(auto)
        e1 = _execution(auto.id, triggered_at=datetime(2024, 1, 1, tzinfo=UTC))
        e2 = _execution(auto.id, triggered_at=datetime(2024, 1, 3, tzinfo=UTC))
        e3 = _execution(auto.id, triggered_at=datetime(2024, 1, 2, tzinfo=UTC))
        for e in [e1, e2, e3]:
            await storage.log_execution(e)
        results = await storage.list_executions(auto.id)
        assert [r.triggered_at for r in results] == sorted(
            [e1.triggered_at, e2.triggered_at, e3.triggered_at], reverse=True
        )

    async def test_output_id_stored(self, storage: PostgresStorage):
        auto = _automation()
        await storage.create(auto)
        e = _execution(auto.id, output_id="batch-cmd-abc123")
        await storage.log_execution(e)
        results = await storage.list_executions(auto.id)
        assert results[0].output_id == "batch-cmd-abc123"

    async def test_cascade_on_delete(self, storage: PostgresStorage):
        auto = _automation()
        await storage.create(auto)
        await storage.log_execution(_execution(auto.id))
        await storage.log_execution(_execution(auto.id))
        await storage.delete(auto.id)
        assert await storage.list_executions(auto.id) == []
