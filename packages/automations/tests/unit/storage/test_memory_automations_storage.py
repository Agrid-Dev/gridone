"""Unit tests for MemoryAutomationsStorage."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from automations.models import (
    Automation,
    AutomationExecution,
    ExecutionStatus,
    Trigger,
)
from automations.storage.memory import MemoryAutomationsStorage

from models.errors import NotFoundError
from models.ids import gen_id

pytestmark = pytest.mark.asyncio


_SCHEDULE = Trigger.model_validate({"type": "schedule", "cron": "0 11 * * *"})


def _automation(**kwargs: object) -> Automation:
    defaults: dict[str, object] = {
        "id": gen_id(),
        "name": "test-auto",
        "description": "",
        "trigger": _SCHEDULE,
        "action_template_id": "tmpl-01",
        "enabled": True,
    }
    return Automation(**{**defaults, **kwargs})  # type: ignore[arg-type]


def _execution(automation_id: str, **kwargs: object) -> AutomationExecution:
    defaults: dict[str, object] = {
        "id": gen_id(),
        "automation_id": automation_id,
        "triggered_at": datetime(2026, 1, 1, tzinfo=UTC),
        "status": ExecutionStatus.SUCCESS,
    }
    return AutomationExecution(**{**defaults, **kwargs})  # type: ignore[arg-type]


@pytest.fixture
def storage() -> MemoryAutomationsStorage:
    return MemoryAutomationsStorage()


class TestCRUD:
    async def test_create_get_roundtrip(self, storage: MemoryAutomationsStorage):
        auto = _automation(description="My Desc")
        await storage.create(auto)
        fetched = await storage.get(auto.id)
        assert fetched.id == auto.id
        assert fetched.description == "My Desc"

    async def test_get_raises_not_found(self, storage: MemoryAutomationsStorage):
        with pytest.raises(NotFoundError):
            await storage.get("missing")

    async def test_list_all(self, storage: MemoryAutomationsStorage):
        a1 = _automation(name="a1", enabled=True)
        a2 = _automation(name="a2", enabled=False)
        await storage.create(a1)
        await storage.create(a2)
        ids = {a.id for a in await storage.list()}
        assert {a1.id, a2.id} == ids

    async def test_list_enabled_filter(self, storage: MemoryAutomationsStorage):
        a1 = _automation(enabled=True)
        a2 = _automation(enabled=False)
        await storage.create(a1)
        await storage.create(a2)
        enabled = await storage.list(enabled=True)
        assert {a.id for a in enabled} == {a1.id}

    async def test_update(self, storage: MemoryAutomationsStorage):
        auto = _automation(name="original")
        await storage.create(auto)
        renamed = auto.model_copy(update={"name": "renamed"})
        await storage.update(renamed)
        assert (await storage.get(auto.id)).name == "renamed"

    async def test_update_raises_not_found(self, storage: MemoryAutomationsStorage):
        with pytest.raises(NotFoundError):
            await storage.update(_automation(id="missing"))

    async def test_delete(self, storage: MemoryAutomationsStorage):
        auto = _automation()
        await storage.create(auto)
        await storage.delete(auto.id)
        with pytest.raises(NotFoundError):
            await storage.get(auto.id)

    async def test_delete_raises_not_found(self, storage: MemoryAutomationsStorage):
        with pytest.raises(NotFoundError):
            await storage.delete("missing")


class TestExecutions:
    async def test_log_and_list(self, storage: MemoryAutomationsStorage):
        auto = _automation()
        await storage.create(auto)
        e = _execution(auto.id)
        await storage.log_execution(e)
        results = await storage.list_executions(auto.id)
        assert [r.id for r in results] == [e.id]

    async def test_list_newest_first(self, storage: MemoryAutomationsStorage):
        auto = _automation()
        await storage.create(auto)
        e1 = _execution(auto.id, triggered_at=datetime(2026, 1, 1, tzinfo=UTC))
        e2 = _execution(auto.id, triggered_at=datetime(2026, 1, 3, tzinfo=UTC))
        e3 = _execution(auto.id, triggered_at=datetime(2026, 1, 2, tzinfo=UTC))
        for e in [e1, e2, e3]:
            await storage.log_execution(e)
        results = await storage.list_executions(auto.id)
        assert [r.triggered_at for r in results] == [
            e2.triggered_at,
            e3.triggered_at,
            e1.triggered_at,
        ]

    async def test_cascade_on_delete(self, storage: MemoryAutomationsStorage):
        auto = _automation()
        await storage.create(auto)
        await storage.log_execution(_execution(auto.id))
        await storage.delete(auto.id)
        assert await storage.list_executions(auto.id) == []


class TestLifecycle:
    async def test_start_and_close_are_idempotent(
        self, storage: MemoryAutomationsStorage
    ):
        await storage.start()
        await storage.close()
        await storage.close()  # second close must not raise
