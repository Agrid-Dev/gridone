from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from automations.models import (
    Action,
    Automation,
    AutomationCreate,
    AutomationUpdate,
    ExecutionStatus,
    Trigger,
    TriggerContext,
)
from automations.service import AutomationsService
from automations.storage.backend import AutomationsStorageBackend

from models.errors import NotFoundError
from models.service import Service

pytestmark = pytest.mark.asyncio

_SCHEDULE = Trigger(provider_id="schedule", params={"cron": "0 11 * * *"})
_CHANGE = Trigger(
    provider_id="change_event",
    params={"device_id": "src-01", "attribute": "temperature"},
)
_ACTION = Action(provider_id="command_template", params={"template_id": "tmpl-abc"})
_NOTIF_ACTION = Action(
    provider_id="notification",
    params={
        "title": "Hot!",
        "body": "Too hot",
        "severity": "alert",
        "user_ids": ["u1"],
    },
)


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


def _make_action_provider(action_type: str = "command_template") -> MagicMock:
    provider = MagicMock()
    provider.id = action_type
    provider.params_schema = {}
    provider.execute = AsyncMock(return_value="output-test")
    return provider


def _make_service(
    storage: AsyncMock | None = None,
    providers: list[MagicMock] | None = None,
    action_providers: list[MagicMock] | None = None,
) -> AutomationsService:
    """Create a service with storage injected directly — no need to call start()."""
    if providers is None:
        providers = [_make_provider("schedule"), _make_provider("change_event")]
    if action_providers is None:
        action_providers = [
            _make_action_provider("command_template"),
            _make_action_provider("notification"),
        ]
    svc = AutomationsService(
        storage_url="postgresql://test",
        trigger_providers=providers,
        action_providers=action_providers,
    )
    svc._storage = storage or _make_storage()  # noqa: SLF001
    return svc


def _create_params(**kwargs: object) -> AutomationCreate:
    defaults: dict[str, object] = {
        "name": "auto-1",
        "trigger": _SCHEDULE,
        "action": _ACTION,
    }
    return AutomationCreate(**{**defaults, **kwargs})  # type: ignore[arg-type]


class TestServiceProtocol:
    async def test_satisfies_service_protocol(self):
        svc = _make_service()
        assert isinstance(svc, Service)


class TestCRUD:
    async def test_create_returns_automation(self):
        svc = _make_service()
        result = await svc.create(_create_params())
        assert isinstance(result, Automation)
        assert result.name == "auto-1"
        assert len(result.id) == 16

    async def test_create_sets_metadata(self):
        svc = _make_service()
        result = await svc.create(_create_params(), created_by="user-01")
        assert result.created_by == "user-01"
        assert result.created_at == result.updated_at

    async def test_update_bumps_updated_at(self):
        svc = _make_service()
        created = await svc.create(_create_params())
        original_updated_at = created.updated_at
        updated = await svc.update(created.id, AutomationUpdate(name="renamed"))
        assert updated.updated_at >= original_updated_at
        assert updated.created_at == created.created_at

    async def test_enable_bumps_updated_at(self):
        svc = _make_service()
        created = await svc.create(_create_params(enabled=False))
        original_updated_at = created.updated_at
        enabled = await svc.enable(created.id)
        assert enabled.updated_at >= original_updated_at

    async def test_disable_bumps_updated_at(self):
        svc = _make_service()
        created = await svc.create(_create_params(enabled=True))
        original_updated_at = created.updated_at
        disabled = await svc.disable(created.id)
        assert disabled.updated_at >= original_updated_at

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

    async def test_list_trigger_schemas_returns_provider_schemas(self):
        p1 = _make_provider("schedule")
        p1.params_schema = {"title": "Schedule"}
        p2 = _make_provider("change_event")
        p2.params_schema = {"title": "Change Event"}
        svc = _make_service(providers=[p1, p2])
        assert svc.list_trigger_schemas() == {
            "schedule": {"title": "Schedule"},
            "change_event": {"title": "Change Event"},
        }


class TestStart:
    async def test_start_calls_storage_start(self):
        storage = _make_storage()
        svc = _make_service()
        with patch("automations.service.build_storage", return_value=storage):
            await svc.start()
        storage.start.assert_called_once()

    async def test_start_registers_enabled_automations_from_storage(self):
        storage = _make_storage()
        provider = _make_provider("schedule")
        auto = Automation(
            id="abc123",
            name="a",
            trigger=_SCHEDULE,
            action=_ACTION,
            enabled=True,
        )
        storage.list.return_value = [auto]
        svc = _make_service(providers=[provider])
        with patch("automations.service.build_storage", return_value=storage):
            await svc.start()
        provider.register.assert_called_once()

    async def test_start_skips_disabled_automations(self):
        storage = _make_storage()
        provider = _make_provider("schedule")
        auto = Automation(
            id="abc123",
            name="a",
            trigger=_SCHEDULE,
            action=_ACTION,
            enabled=False,
        )
        storage.list.return_value = [auto]
        svc = _make_service(providers=[provider])
        with patch("automations.service.build_storage", return_value=storage):
            await svc.start()
        provider.register.assert_not_called()

    async def test_start_is_idempotent(self):
        storage = _make_storage()
        provider = _make_provider("schedule")
        storage.list.return_value = [
            Automation(
                id="a1",
                name="a1",
                trigger=_SCHEDULE,
                action=_ACTION,
                enabled=True,
            ),
            Automation(
                id="a2",
                name="a2",
                trigger=_SCHEDULE,
                action=_ACTION,
                enabled=True,
            ),
        ]
        svc = _make_service(providers=[provider])
        with patch("automations.service.build_storage", return_value=storage):
            await svc.start()
            await svc.start()
        assert len(svc._handles) == 2  # noqa: SLF001
        assert provider.register.call_count == 2

    async def test_start_zero_automations_not_blocked(self):
        storage = _make_storage()
        storage.list.return_value = []
        svc = _make_service()
        with patch("automations.service.build_storage", return_value=storage):
            await svc.start()
            await svc.start()
        assert svc._handles == {}  # noqa: SLF001

    async def test_start_after_stop_restarts(self):
        storage = _make_storage()
        provider = _make_provider("schedule")
        storage.list.return_value = [
            Automation(
                id="a1",
                name="a1",
                trigger=_SCHEDULE,
                action=_ACTION,
                enabled=True,
            ),
        ]
        svc = _make_service(providers=[provider])
        with patch("automations.service.build_storage", return_value=storage):
            await svc.start()
            await svc.stop()
            await svc.start()
        assert len(svc._handles) == 1  # noqa: SLF001
        assert provider.register.call_count == 2


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

    async def test_enable_already_enabled_is_noop(self):
        provider = _make_provider("schedule")
        svc = _make_service(providers=[provider])
        created = await svc.create(_create_params(enabled=True))
        provider.register.reset_mock()
        result = await svc.enable(created.id)
        provider.register.assert_not_called()
        assert result.enabled is True

    async def test_disable_already_disabled_is_noop(self):
        provider = _make_provider("schedule")
        svc = _make_service(providers=[provider])
        created = await svc.create(_create_params(enabled=False))
        result = await svc.disable(created.id)
        provider.unregister.assert_not_called()
        assert result.enabled is False

    async def test_start_trigger_raises_if_already_registered(self):
        provider = _make_provider("schedule")
        svc = _make_service(providers=[provider])
        created = await svc.create(_create_params(enabled=True))
        with pytest.raises(RuntimeError, match="already registered"):
            await svc._start_trigger(created)  # noqa: SLF001

    async def test_register_passes_trigger_params(self):
        provider = _make_provider("schedule")
        svc = _make_service(providers=[provider])
        await svc.create(_create_params(trigger=_SCHEDULE, enabled=True))
        call_params = provider.register.call_args[0][0]
        assert call_params == {"cron": "0 11 * * *"}


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
    @pytest.mark.parametrize(
        ("action", "expected_params"),
        [
            (_ACTION, {"template_id": "tmpl-abc"}),
            (
                _NOTIF_ACTION,
                {
                    "title": "Hot!",
                    "body": "Too hot",
                    "severity": "alert",
                    "user_ids": ["u1"],
                },
            ),
        ],
    )
    async def test_dispatches_to_action_provider(self, action, expected_params):
        provider = _make_action_provider(action.provider_id)
        svc = _make_service(action_providers=[provider])
        created = await svc.create(_create_params(action=action, enabled=False))
        await svc._make_on_fire(created.id)(_CTX)  # noqa: SLF001
        provider.execute.assert_awaited_once_with(expected_params)

    async def test_logs_success_execution(self):
        storage = _make_storage()
        action_provider = _make_action_provider("command_template")
        action_provider.execute.return_value = "output-abc123"
        svc = _make_service(storage=storage, action_providers=[action_provider])
        created = await svc.create(_create_params(enabled=False))
        await svc._make_on_fire(created.id)(_CTX)  # noqa: SLF001
        execution = storage.log_execution.call_args[0][0]
        assert execution.automation_id == created.id
        assert execution.status == ExecutionStatus.SUCCESS
        assert execution.error is None
        assert execution.output_id == "output-abc123"

    async def test_logs_failed_execution_on_action_error(self):
        storage = _make_storage()
        action_provider = _make_action_provider("command_template")
        action_provider.execute.side_effect = RuntimeError("boom")
        svc = _make_service(storage=storage, action_providers=[action_provider])
        created = await svc.create(_create_params(enabled=False))
        await svc._make_on_fire(created.id)(_CTX)  # noqa: SLF001
        execution = storage.log_execution.call_args[0][0]
        assert execution.status == ExecutionStatus.FAILED
        assert execution.error is not None
        assert execution.output_id is None

    async def test_no_exception_propagated_on_action_error(self):
        action_provider = _make_action_provider("command_template")
        action_provider.execute.side_effect = RuntimeError("boom")
        svc = _make_service(action_providers=[action_provider])
        created = await svc.create(_create_params(enabled=False))
        await svc._make_on_fire(created.id)(_CTX)  # must not raise  # noqa: SLF001

    async def test_raises_not_found_when_automation_missing(self):
        svc = _make_service()
        with pytest.raises(NotFoundError):
            await svc._make_on_fire("nonexistent")(_CTX)  # noqa: SLF001

    async def test_logs_failed_execution_on_unknown_action_type(self):
        storage = _make_storage()
        svc = _make_service(storage=storage, action_providers=[])
        created = await svc.create(_create_params(enabled=False))
        await svc._make_on_fire(created.id)(_CTX)  # noqa: SLF001
        execution = storage.log_execution.call_args[0][0]
        assert execution.status == ExecutionStatus.FAILED
        assert execution.output_id is None


class TestActionSchemas:
    async def test_returns_provider_schemas(self):
        p1 = _make_action_provider("command_template")
        p1.params_schema = {"title": "Command"}
        p2 = _make_action_provider("notification")
        p2.params_schema = {"title": "Notification"}
        svc = _make_service(action_providers=[p1, p2])
        assert svc.list_action_schemas() == {
            "command_template": {"title": "Command"},
            "notification": {"title": "Notification"},
        }


class TestStop:
    async def test_stop_unregisters_all_triggers_and_storage(self):
        storage = _make_storage()
        provider = _make_provider("schedule")
        svc = _make_service(storage=storage, providers=[provider])
        await svc.create(_create_params(enabled=True))
        await svc.create(_create_params(enabled=True))
        await svc.stop()
        assert provider.unregister.call_count == 2
        storage.close.assert_called_once()

    async def test_stop_before_start_does_not_raise(self):
        svc = AutomationsService(
            storage_url="postgresql://test",
            trigger_providers=[],
            action_providers=[],
        )
        await svc.stop()  # _storage not set — must not raise
