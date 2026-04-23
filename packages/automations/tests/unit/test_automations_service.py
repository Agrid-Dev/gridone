from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from automations.models import (
    Automation,
    AutomationCreate,
    AutomationUpdate,
    ChangeEventTrigger,
    ExecutionStatus,
    ScheduleTrigger,
    TriggerContext,
)
from automations.service import AutomationsService
from automations.storage.backend import AutomationsStorageBackend

from models.errors import NotFoundError

pytestmark = pytest.mark.asyncio

_SCHEDULE = ScheduleTrigger(cron="0 11 * * *")
_CHANGE = ChangeEventTrigger(source_id="src-01", event_type="temperature")
_TMPL = "tmpl-abc"


def _make_storage() -> AsyncMock:
    storage = AsyncMock(spec=AutomationsStorageBackend)
    storage.list.return_value = []
    return storage


def _make_provider(trigger_type: str = "schedule") -> MagicMock:
    provider = MagicMock()
    provider.id = trigger_type
    provider.register = AsyncMock(return_value="handle-01")
    provider.unregister = AsyncMock()
    return provider


def _make_service(
    storage: AsyncMock | None = None,
    providers: list[MagicMock] | None = None,
    actions: AsyncMock | None = None,
) -> AutomationsService:
    if providers is None:
        providers = [_make_provider("schedule"), _make_provider("change_event")]
    return AutomationsService(
        storage=storage or _make_storage(),
        triggers=providers,
        actions=actions or AsyncMock(),
    )


def _create_params(**kwargs: object) -> AutomationCreate:
    defaults: dict[str, object] = {
        "name": "auto-1",
        "trigger": _SCHEDULE,
        "action_template_id": _TMPL,
    }
    return AutomationCreate(**{**defaults, **kwargs})  # type: ignore[arg-type]


class TestCRUD:
    async def test_create_returns_automation(self):
        svc = _make_service()
        result = await svc.create(_create_params())
        assert isinstance(result, Automation)
        assert result.name == "auto-1"
        assert len(result.id) == 16

    async def test_get_returns_cached(self):
        svc = _make_service()
        created = await svc.create(_create_params())
        fetched = await svc.get(created.id)
        assert fetched.id == created.id

    async def test_get_raises_not_found(self):
        svc = _make_service()
        with pytest.raises(NotFoundError):
            await svc.get("nonexistent")

    async def test_list_all(self):
        svc = _make_service()
        a1 = await svc.create(_create_params(name="a1"))
        a2 = await svc.create(_create_params(name="a2", enabled=False))
        ids = {a.id for a in await svc.list()}
        assert {a1.id, a2.id} == ids

    async def test_update_applies_partial(self):
        svc = _make_service()
        created = await svc.create(_create_params())
        updated = await svc.update(created.id, AutomationUpdate(name="renamed"))
        assert updated.name == "renamed"
        assert updated.trigger == _SCHEDULE

    async def test_update_raises_not_found(self):
        svc = _make_service()
        with pytest.raises(NotFoundError):
            await svc.update("missing", AutomationUpdate(name="x"))

    async def test_delete_removes_from_cache(self):
        svc = _make_service()
        created = await svc.create(_create_params(enabled=False))
        await svc.delete(created.id)
        with pytest.raises(NotFoundError):
            await svc.get(created.id)

    async def test_delete_raises_not_found(self):
        svc = _make_service()
        with pytest.raises(NotFoundError):
            await svc.delete("missing")


class TestCache:
    async def test_empty_on_init(self):
        svc = _make_service()
        assert await svc.list() == []

    async def test_populated_after_create_enabled(self):
        svc = _make_service()
        created = await svc.create(_create_params(enabled=True))
        assert any(a.id == created.id for a in await svc.list(enabled=True))

    async def test_not_populated_in_enabled_after_create_disabled(self):
        svc = _make_service()
        await svc.create(_create_params(enabled=False))
        assert await svc.list(enabled=True) == []

    async def test_list_enabled_reads_cache_not_storage(self):
        storage = _make_storage()
        svc = _make_service(storage=storage)
        await svc.create(_create_params(enabled=True))
        storage.list.reset_mock()
        await svc.list(enabled=True)
        storage.list.assert_not_called()

    async def test_list_disabled(self):
        svc = _make_service()
        await svc.create(_create_params(enabled=False))
        assert len(await svc.list(enabled=False)) == 1

    async def test_cache_updated_after_update(self):
        svc = _make_service()
        created = await svc.create(_create_params())
        await svc.update(created.id, AutomationUpdate(name="new-name"))
        assert (await svc.get(created.id)).name == "new-name"

    async def test_cache_cleared_after_delete(self):
        svc = _make_service()
        created = await svc.create(_create_params(enabled=False))
        await svc.delete(created.id)
        assert created.id not in {a.id for a in await svc.list()}

    async def test_cache_updated_after_enable(self):
        svc = _make_service()
        created = await svc.create(_create_params(enabled=False))
        await svc.enable(created.id)
        assert (await svc.get(created.id)).enabled is True

    async def test_cache_updated_after_disable(self):
        svc = _make_service()
        created = await svc.create(_create_params(enabled=True))
        await svc.disable(created.id)
        assert (await svc.get(created.id)).enabled is False


class TestTriggers:
    async def test_registered_on_create_enabled(self):
        provider = _make_provider("schedule")
        svc = _make_service(providers=[provider])
        await svc.create(_create_params(enabled=True))
        provider.register.assert_called_once()

    async def test_not_registered_on_create_disabled(self):
        provider = _make_provider("schedule")
        svc = _make_service(providers=[provider])
        await svc.create(_create_params(enabled=False))
        provider.register.assert_not_called()

    async def test_registered_on_enable(self):
        provider = _make_provider("schedule")
        svc = _make_service(providers=[provider])
        created = await svc.create(_create_params(enabled=False))
        provider.register.reset_mock()
        await svc.enable(created.id)
        provider.register.assert_called_once()

    async def test_unregistered_on_disable(self):
        provider = _make_provider("schedule")
        svc = _make_service(providers=[provider])
        created = await svc.create(_create_params(enabled=True))
        await svc.disable(created.id)
        provider.unregister.assert_called_once_with("handle-01")

    async def test_unregistered_before_db_write_on_disable(self):
        """Trigger unregister must happen before storage.update, not after."""
        storage = _make_storage()
        provider = _make_provider("schedule")
        svc = _make_service(storage=storage, providers=[provider])
        created = await svc.create(_create_params(enabled=True))
        call_order: list[str] = []
        provider.unregister.side_effect = lambda _: call_order.append("stop")
        storage.update.side_effect = lambda *_: call_order.append("db_write")
        await svc.disable(created.id)
        assert call_order == ["stop", "db_write"]

    async def test_unregistered_on_delete(self):
        provider = _make_provider("schedule")
        svc = _make_service(providers=[provider])
        created = await svc.create(_create_params(enabled=True))
        await svc.delete(created.id)
        provider.unregister.assert_called_once_with("handle-01")

    async def test_restarted_on_trigger_change(self):
        schedule_provider = _make_provider("schedule")
        change_provider = _make_provider("change_event")
        svc = _make_service(providers=[schedule_provider, change_provider])
        await svc.create(_create_params(trigger=_SCHEDULE))
        await svc.update((await svc.list())[0].id, AutomationUpdate(trigger=_CHANGE))
        schedule_provider.unregister.assert_called_once()
        change_provider.register.assert_called_once()

    async def test_only_unregistered_on_update_to_disabled(self):
        provider = _make_provider("schedule")
        svc = _make_service(providers=[provider])
        created = await svc.create(_create_params(enabled=True))
        await svc.update(created.id, AutomationUpdate(enabled=False))
        provider.unregister.assert_called_once()
        assert provider.register.call_count == 1  # only the initial create

    async def test_no_change_on_non_trigger_update(self):
        provider = _make_provider("schedule")
        svc = _make_service(providers=[provider])
        created = await svc.create(_create_params(enabled=True))
        await svc.update(created.id, AutomationUpdate(name="new-name"))
        provider.unregister.assert_not_called()
        assert provider.register.call_count == 1

    async def test_register_passes_params_without_type(self):
        provider = _make_provider("schedule")
        svc = _make_service(providers=[provider])
        await svc.create(_create_params(trigger=_SCHEDULE, enabled=True))
        call_params = provider.register.call_args[0][0]
        assert "type" not in call_params
        assert call_params["cron"] == "0 11 * * *"


class TestExecutions:
    async def test_list_executions_delegates_to_storage(self):
        storage = _make_storage()
        storage.list_executions.return_value = []
        svc = _make_service(storage=storage)
        result = await svc.list_executions("auto-01")
        storage.list_executions.assert_called_once_with("auto-01")
        assert result == []

    async def test_delete_delegates_to_storage(self):
        storage = _make_storage()
        svc = _make_service(storage=storage)
        created = await svc.create(_create_params(enabled=False))
        await svc.delete(created.id)
        storage.delete.assert_called_once_with(created.id)


_CTX = TriggerContext(timestamp=datetime(2024, 1, 1, tzinfo=UTC))


class TestOnFire:
    async def test_calls_action_with_template_id(self):
        actions = AsyncMock()
        actions.execute.return_value = "out-01"
        svc = _make_service(actions=actions)
        created = await svc.create(_create_params(enabled=False))
        await svc._make_on_fire(created.id)(_CTX)
        actions.execute.assert_called_once_with(created.action_template_id)

    async def test_logs_success_execution(self):
        storage = _make_storage()
        actions = AsyncMock()
        actions.execute.return_value = "out-01"
        svc = _make_service(storage=storage, actions=actions)
        created = await svc.create(_create_params(enabled=False))
        await svc._make_on_fire(created.id)(_CTX)
        execution = storage.log_execution.call_args[0][0]
        assert execution.automation_id == created.id
        assert execution.status == ExecutionStatus.SUCCESS
        assert execution.output_id == "out-01"
        assert execution.error is None

    async def test_logs_failed_execution_on_action_error(self):
        storage = _make_storage()
        actions = AsyncMock()
        actions.execute.side_effect = RuntimeError("boom")
        svc = _make_service(storage=storage, actions=actions)
        created = await svc.create(_create_params(enabled=False))
        await svc._make_on_fire(created.id)(_CTX)
        execution = storage.log_execution.call_args[0][0]
        assert execution.status == ExecutionStatus.FAILED
        assert execution.error is not None
        assert execution.output_id is None

    async def test_no_exception_propagated_on_action_error(self):
        actions = AsyncMock()
        actions.execute.side_effect = RuntimeError("boom")
        svc = _make_service(actions=actions)
        created = await svc.create(_create_params(enabled=False))
        await svc._make_on_fire(created.id)(_CTX)  # must not raise


class TestClose:
    async def test_close_unregisters_all_triggers_and_storage(self):
        storage = _make_storage()
        provider = _make_provider("schedule")
        svc = _make_service(storage=storage, providers=[provider])
        await svc.create(_create_params(enabled=True))
        await svc.create(_create_params(enabled=True))
        await svc.close()
        assert provider.unregister.call_count == 2
        storage.close.assert_called_once()
