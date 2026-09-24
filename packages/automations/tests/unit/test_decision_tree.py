"""Compatibility, ordered evaluation and fail-closed execution safeguards."""

import asyncio
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from automations.models import (
    Action,
    Automation,
    AutomationBranch,
    AutomationCreate,
    AutomationGuardrails,
    AutomationUpdate,
    AutomationWrite,
    ExecutionStatus,
    Trigger,
    TriggerContext,
)
from automations.service import AutomationsService
from automations.storage.backend import AutomationsStorageBackend
from automations.trigger_providers.schedule import ScheduleTriggerProvider
from pydantic import BaseModel, ValidationError

from models.attribute_observation import AttributeObservation
from models.errors import SchemaValidationError
from models.expressions import (
    Comparison,
    DeviceAttributeRef,
    EventRef,
    IsKnown,
    Junction,
)

pytestmark = pytest.mark.asyncio
EVENT = TriggerContext(
    timestamp=datetime.now(UTC),
    device_id="a",
    attribute="running",
    previous_value=True,
    value=False,
    has_previous=True,
)
ACTION = Action(provider_id="test")
TRIGGER = Trigger(provider_id="test")


class EmptyParams(BaseModel):
    pass


@pytest.fixture
def engine():
    trigger = MagicMock(id="test", params_model=EmptyParams)
    trigger.register = AsyncMock(return_value="listener")
    trigger.unregister = AsyncMock()
    action = MagicMock(id="test", params_model=EmptyParams)
    action.execute = AsyncMock(return_value="command")
    action.describe_writes = AsyncMock(return_value=[])
    resolver = MagicMock(
        return_value=AttributeObservation(validity="known", value=True)
    )
    service = AutomationsService(None, [trigger], [action], resolve_attribute=resolver)
    storage = AsyncMock(spec=AutomationsStorageBackend)
    service._storage = storage  # noqa: SLF001
    return service, action, storage, resolver


def branch(name: str, *, value: bool) -> AutomationBranch:
    return AutomationBranch(
        name=name,
        action=ACTION,
        condition=Comparison(op="eq", left=EventRef(event="value"), right=value),
    )


async def fire(service, automation):
    await service._make_on_fire(automation.id)(EVENT)  # noqa: SLF001


async def test_single_branch_roundtrip_and_update(engine):
    service, action, storage, _ = engine
    created = await service.create(
        AutomationCreate(
            name="single", trigger=TRIGGER, branches=[AutomationBranch(action=ACTION)]
        ),
        created_by="user",
    )
    assert created.branches[0].condition is None
    restored = Automation.model_validate_json(created.model_dump_json())
    assert restored.branches == created.branches
    await fire(service, created)
    action.execute.assert_awaited_once_with({}, EVENT)
    assert storage.log_execution.call_args.args[0].context == EVENT
    replaced = created.branches[0].model_copy(
        update={"action": Action(provider_id="test", params={"x": 1})}
    )
    updated = await service.update(created.id, AutomationUpdate(branches=[replaced]))
    assert updated.branches[0].id == created.branches[0].id
    assert updated.branches[0].action.params == {"x": 1}


async def test_first_match_only_with_cross_device_condition(engine):
    service, action, storage, resolver = engine
    second = AutomationBranch(
        action=ACTION,
        condition=Junction(
            op="all",
            conditions=[
                Comparison(
                    op="eq",
                    left=DeviceAttributeRef(device_id="b", attribute="healthy"),
                    right=True,
                ),
                Comparison(op="eq", left=EventRef(event="previous_value"), right=True),
            ],
        ),
    )
    created = await service.create(
        AutomationCreate(
            name="tree",
            trigger=TRIGGER,
            branches=[
                branch("skip", value=True),
                second,
                branch("not reached", value=False),
            ],
        ),
        created_by="user",
    )
    await fire(service, created)
    action.execute.assert_awaited_once()
    execution = storage.log_execution.call_args.args[0]
    assert execution.branch_id == second.id
    assert [b.result for b in execution.branches] == ["not_matched", "matched"]
    resolver.assert_called_once_with(
        DeviceAttributeRef(device_id="b", attribute="healthy"), max_age_seconds=None
    )


@pytest.mark.parametrize("validity", ["unknown", "invalid"])
async def test_unknown_stops_before_fallback(engine, validity):
    service, action, storage, resolver = engine
    resolver.return_value = AttributeObservation(validity=validity)
    condition = Comparison(
        op="eq", left=DeviceAttributeRef(device_id="b", attribute="healthy"), right=True
    )
    created = await service.create(
        AutomationCreate(
            name="unknown",
            trigger=TRIGGER,
            branches=[
                AutomationBranch(action=ACTION, condition=condition),
                AutomationBranch(action=ACTION),
            ],
        ),
        created_by="user",
    )
    await fire(service, created)
    action.execute.assert_not_awaited()
    execution = storage.log_execution.call_args.args[0]
    assert execution.reason == "condition_unknown"
    assert execution.branches[0].missing == ["b/healthy"]


async def test_no_match_is_logged_without_counting_as_an_execution(engine):
    service, action, storage, _ = engine
    created = await service.create(
        AutomationCreate(
            name="no match", trigger=TRIGGER, branches=[branch("skip", value=True)]
        ),
        created_by="user",
    )
    for _ in range(20):
        await fire(service, created)
    action.execute.assert_not_awaited()
    assert storage.log_execution.call_args.args[0].status == ExecutionStatus.NO_MATCH
    assert (await service.get(created.id)).enabled


async def test_initial_observation_never_dispatches(engine):
    service, action, storage, _ = engine
    created = await service.create(
        AutomationCreate(
            name="initial", trigger=TRIGGER, branches=[AutomationBranch(action=ACTION)]
        ),
        created_by="user",
    )
    await service._make_on_fire(created.id)(  # noqa: SLF001
        EVENT.model_copy(update={"is_initial": True, "has_previous": False})
    )
    action.execute.assert_not_awaited()
    assert storage.log_execution.call_args.args[0].status == ExecutionStatus.INITIALIZED
    await fire(service, created)
    action.execute.assert_awaited_once()


async def test_deactivation_is_traced_and_enable_does_not_fire(engine):
    service, action, storage, _ = engine
    created = await service.create(
        AutomationCreate(
            name="disable", trigger=TRIGGER, branches=[AutomationBranch(action=ACTION)]
        ),
        created_by="user",
    )
    disabled = await service.disable(
        created.id, reason="Maintenance", actor_id="operator"
    )
    assert disabled.deactivation is not None
    assert disabled.deactivation.actor_id == "operator"
    assert disabled.deactivation.reason == "Maintenance"
    assert disabled.deactivation.source == "operator"
    assert not disabled.enabled
    # A second request changes nothing: the trace describes the current stop.
    assert (
        await service.disable(created.id, reason="Second request", actor_id="other")
        == disabled
    )
    storage.update.assert_awaited_with(disabled)
    await fire(service, created)
    action.execute.assert_not_awaited()
    resumed = await service.enable(created.id)
    assert resumed.enabled
    assert resumed.deactivation is None
    action.execute.assert_not_awaited()
    await fire(service, resumed)
    action.execute.assert_awaited_once()


async def test_disable_without_reason_still_records_actor_and_time(engine):
    service, _, _, _ = engine
    created = await service.create(
        AutomationCreate(
            name="disable", trigger=TRIGGER, branches=[AutomationBranch(action=ACTION)]
        ),
        created_by="user",
    )
    disabled = await service.disable(created.id, actor_id="operator")
    assert disabled.deactivation is not None
    assert disabled.deactivation.reason is None
    assert disabled.deactivation.actor_id == "operator"
    assert disabled.deactivation.at <= datetime.now(UTC)


async def test_indirect_feedback_stops_at_configured_limit(engine):
    service, action, storage, _ = engine
    created = await service.create(
        AutomationCreate(
            name="loop",
            trigger=TRIGGER,
            branches=[AutomationBranch(action=ACTION)],
            guardrails=AutomationGuardrails(max_executions=2),
        ),
        created_by="user",
    )
    for _ in range(5):
        await fire(service, created)
    assert action.execute.await_count == 2
    stopped = await service.get(created.id)
    assert stopped.deactivation.source == "circuit_breaker"
    assert stopped.deactivation.reason == "execution_rate_exceeded"
    assert storage.log_execution.call_args.args[0].status == ExecutionStatus.TRIPPED
    await service.enable(created.id)
    await fire(service, created)
    assert action.execute.await_count == 3


async def test_schedule_automation_tripping_its_breaker_stops_cleanly():
    """The trip unregisters the schedule from inside the listener's own task."""
    provider = ScheduleTriggerProvider()
    action = MagicMock(id="test", params_model=EmptyParams)
    action.execute = AsyncMock(return_value="command")
    action.describe_writes = AsyncMock(return_value=[])
    service = AutomationsService(None, [provider], [action])
    service._storage = AsyncMock(spec=AutomationsStorageBackend)  # noqa: SLF001
    soon_due = MagicMock()
    soon_due.get_next.side_effect = lambda _: (
        datetime.now(UTC) + timedelta(milliseconds=5)
    )
    with patch(
        "automations.trigger_providers.schedule.croniter", return_value=soon_due
    ):
        created = await service.create(
            AutomationCreate(
                name="cron",
                trigger=Trigger(provider_id="schedule", params={"cron": "* * * * *"}),
                branches=[AutomationBranch(action=ACTION)],
                guardrails=AutomationGuardrails(max_executions=1),
            ),
            created_by="user",
        )
        (listener,) = provider._listeners.values()  # noqa: SLF001
        task = listener._task  # noqa: SLF001
        assert task is not None
        # The second occurrence exceeds the rate and trips the breaker, which
        # stops the listener from within this very task.
        await asyncio.wait_for(task, timeout=1)
    assert not task.cancelled()
    assert task.cancelling() == 0
    assert not (await service.get(created.id)).enabled
    assert provider._listeners == {}  # noqa: SLF001
    assert action.execute.await_count == 1


async def test_overlapping_event_is_skipped_and_keeps_the_automation_enabled(engine):
    """A second event during a run is not a loop: dropped, recorded, no trip."""
    service, action, storage, _ = engine
    started, finish = asyncio.Event(), asyncio.Event()

    async def execute(*_args: object) -> None:
        started.set()
        await finish.wait()

    action.execute.side_effect = execute
    created = await service.create(
        AutomationCreate(
            name="overlap", trigger=TRIGGER, branches=[AutomationBranch(action=ACTION)]
        ),
        created_by="user",
    )
    task = asyncio.create_task(fire(service, created))
    await started.wait()
    try:
        await fire(service, created)
        skipped = storage.log_execution.call_args.args[0]
        assert skipped.status == ExecutionStatus.SKIPPED
        assert skipped.reason == "overlapping_execution"
        assert (await service.get(created.id)).enabled
        assert (await service.get(created.id)).deactivation is None
        action.execute.assert_awaited_once()
    finally:
        finish.set()
        await task
    # The run that was in flight completes and is recorded as usual.
    assert storage.log_execution.call_args.args[0].status == ExecutionStatus.SUCCESS


async def test_failure_never_falls_through_and_eventually_suspends(engine):
    service, action, storage, _ = engine
    action.execute.side_effect = RuntimeError("private backend error")
    created = await service.create(
        AutomationCreate(
            name="failure",
            trigger=TRIGGER,
            branches=[branch("first", value=False), branch("fallback", value=False)],
        ),
        created_by="user",
    )
    for _ in range(3):
        await fire(service, created)
    assert action.execute.await_count == 3
    assert (await service.get(created.id)).deactivation.reason == "consecutive_failures"
    assert storage.log_execution.call_args.args[0].error == "Action execution failed"


@pytest.mark.parametrize(
    "branches",
    [[], [branch("same", value=False)] * 2, [AutomationBranch(action=ACTION)] * 65],
)
async def test_invalid_trees_rejected(branches):
    with pytest.raises(ValidationError):
        AutomationCreate(name="invalid", trigger=TRIGGER, branches=branches)


async def test_absent_previous_value_is_testable():
    from automations.evaluation import select_branch

    rule = Automation(
        name="initial",
        trigger=TRIGGER,
        branches=[
            AutomationBranch(
                action=ACTION,
                condition=IsKnown(
                    op="is_known", value=EventRef(event="previous_value")
                ),
            )
        ],
    )
    trace = []
    assert (
        select_branch(rule, TriggerContext(timestamp=EVENT.timestamp), None, trace)
        is None
    )
    assert trace[0].result == "not_matched"


async def test_whole_tree_evaluation_budget_prevents_dispatch(engine, monkeypatch):
    service, action, storage, _ = engine
    monkeypatch.setattr("automations.evaluation.MAX_DEVICE_OPERATIONS", 2)
    created = await service.create(
        AutomationCreate(
            name="bounded", trigger=TRIGGER, branches=[branch("condition", value=False)]
        ),
        created_by="user",
    )
    await fire(service, created)
    action.execute.assert_not_awaited()
    assert storage.log_execution.call_args.args[0].reason == "evaluation_limit"


async def test_rate_window_expires_without_deactivation(engine, monkeypatch):
    service, action, _, _ = engine
    now = MagicMock(return_value=1)
    monkeypatch.setattr("automations.service.monotonic", now)
    created = await service.create(
        AutomationCreate(
            name="cadence",
            trigger=TRIGGER,
            branches=[AutomationBranch(action=ACTION)],
            guardrails=AutomationGuardrails(max_executions=1, window_seconds=10),
        ),
        created_by="user",
    )
    await fire(service, created)
    now.return_value = 11
    await fire(service, created)
    assert action.execute.await_count == 2
    assert (await service.get(created.id)).enabled


async def test_failed_enable_retains_deactivation(engine):
    service, action, storage, _ = engine
    created = await service.create(
        AutomationCreate(
            name="resume", trigger=TRIGGER, branches=[AutomationBranch(action=ACTION)]
        ),
        created_by="user",
    )
    disabled = await service.disable(
        created.id, reason="Maintenance", actor_id="operator"
    )
    storage.update.reset_mock()
    service._providers["test"].register.side_effect = RuntimeError("unavailable")  # noqa: SLF001
    with pytest.raises(RuntimeError, match="unavailable"):
        await service.enable(created.id)
    assert await service.get(created.id) == disabled
    storage.update.assert_not_awaited()
    action.execute.assert_not_awaited()


async def test_direct_feedback_trips_before_dispatch_for_any_provider(engine):
    """The service checks every provider's described writes against the event."""
    service, action, storage, _ = engine
    action.describe_writes.return_value = [
        AutomationWrite(device_id="a", attribute="running", value=False)
    ]
    created = await service.create(
        AutomationCreate(
            name="feedback",
            trigger=TRIGGER,
            branches=[AutomationBranch(action=ACTION)],
        ),
        created_by="user",
    )
    await fire(service, created)
    action.execute.assert_not_awaited()
    tripped = await service.get(created.id)
    assert tripped.deactivation.source == "circuit_breaker"
    assert tripped.deactivation.reason == "direct_feedback"
    assert storage.log_execution.call_args.args[0].status == ExecutionStatus.TRIPPED
    await fire(service, created)
    action.execute.assert_not_awaited()


@pytest.mark.parametrize(
    ("event", "write"),
    [
        (EVENT, AutomationWrite(device_id="a", attribute="command", value=True)),
        (EVENT, AutomationWrite(device_id="b", attribute="running", value=True)),
        (
            TriggerContext(timestamp=EVENT.timestamp),
            AutomationWrite(device_id="a", attribute="running", value=True),
        ),
    ],
)
async def test_writes_elsewhere_are_dispatched(engine, event, write):
    """Another point, another device, or no event device at all: no feedback."""
    service, action, _, _ = engine
    action.describe_writes.return_value = [write]
    created = await service.create(
        AutomationCreate(
            name="elsewhere",
            trigger=TRIGGER,
            branches=[AutomationBranch(action=ACTION)],
        ),
        created_by="user",
    )
    await service._make_on_fire(created.id)(event)  # noqa: SLF001
    action.execute.assert_awaited_once_with({}, event)
    assert (await service.get(created.id)).enabled


async def test_reordering_keeps_branches_and_diagnostics(engine):
    service, _, _, _ = engine
    first, second = branch("first", value=True), branch("second", value=False)
    created = await service.create(
        AutomationCreate(name="tree", trigger=TRIGGER, branches=[first, second]),
        created_by="user",
    )
    updated = await service.update(
        created.id, AutomationUpdate(branches=[second, first])
    )
    assert updated.branches == [second, first]
    assert await service.list_diagnostics(updated.id) == []


async def test_nested_decisions_follow_one_path_and_log_each_level(engine):
    service, action, storage, _ = engine
    leaf = branch("selected", value=False)
    parent = AutomationBranch(
        name="parent", branches=[branch("skip", value=True), leaf]
    )
    created = await service.create(
        AutomationCreate(
            name="nested",
            trigger=TRIGGER,
            branches=[parent, AutomationBranch(action=ACTION)],
        ),
        created_by="user",
    )
    await fire(service, created)
    action.execute.assert_awaited_once_with({}, EVENT)
    execution = storage.log_execution.call_args.args[0]
    assert execution.branch_id == leaf.id
    assert [item.path for item in execution.branches] == [[1], [1, 1], [1, 2]]
    assert [item.result for item in execution.branches] == [
        "matched",
        "not_matched",
        "matched",
    ]


async def test_nonmatching_parent_skips_its_entire_subtree(engine):
    service, action, storage, _ = engine
    skipped = branch("parent", value=True)
    parent = AutomationBranch(
        condition=skipped.condition, branches=[AutomationBranch(action=ACTION)]
    )
    fallback = AutomationBranch(action=ACTION)
    created = await service.create(
        AutomationCreate(name="nested", trigger=TRIGGER, branches=[parent, fallback]),
        created_by="user",
    )
    await fire(service, created)
    action.execute.assert_awaited_once()
    execution = storage.log_execution.call_args.args[0]
    assert execution.branch_id == fallback.id
    assert [item.path for item in execution.branches] == [[1], [2]]


@pytest.mark.parametrize("unknown", [False, True])
async def test_matched_subtree_never_falls_back_to_ancestor_siblings(engine, unknown):
    service, action, storage, resolver = engine
    child = branch("no match", value=True)
    if unknown:
        child = AutomationBranch(
            action=ACTION,
            condition=Comparison(
                op="eq",
                left=DeviceAttributeRef(device_id="b", attribute="fault"),
                right=False,
            ),
        )
        resolver.return_value = AttributeObservation(validity="unknown")
    created = await service.create(
        AutomationCreate(
            name="nested",
            trigger=TRIGGER,
            branches=[
                AutomationBranch(branches=[child]),
                AutomationBranch(action=ACTION),
            ],
        ),
        created_by="user",
    )
    await fire(service, created)
    action.execute.assert_not_awaited()
    execution = storage.log_execution.call_args.args[0]
    assert execution.status == (
        ExecutionStatus.FAILED if unknown else ExecutionStatus.NO_MATCH
    )
    assert [item.path for item in execution.branches] == [[1], [1, 1]]


async def test_nested_action_validation_runs_before_persistence(engine):
    service, _, storage, _ = engine
    invalid = AutomationBranch(
        branches=[AutomationBranch(action=Action(provider_id="missing"))]
    )
    with pytest.raises(SchemaValidationError):
        await service.create(
            AutomationCreate(name="invalid", trigger=TRIGGER, branches=[invalid]),
            created_by="user",
        )
    storage.create.assert_not_awaited()


@pytest.mark.parametrize("violation", ["depth", "total", "duplicate"])
async def test_complete_tree_bounds_and_identifiers(violation):
    branches = [AutomationBranch(action=ACTION)]
    if violation == "depth":
        for _ in range(16):
            branches = [AutomationBranch(branches=branches)]
    elif violation == "total":
        branches = [
            AutomationBranch(
                branches=[AutomationBranch(action=ACTION) for _ in range(64)]
            )
        ]
    else:
        branches = [
            AutomationBranch(id="duplicate", action=ACTION),
            AutomationBranch(
                branches=[AutomationBranch(id="duplicate", action=ACTION)]
            ),
        ]
    for model, args in [
        (AutomationCreate, {"name": "invalid", "trigger": TRIGGER}),
        (AutomationUpdate, {}),
    ]:
        with pytest.raises(ValidationError):
            model.model_validate({**args, "branches": branches})


@pytest.mark.parametrize(
    ("action", "children"), [(None, []), (ACTION, [AutomationBranch(action=ACTION)])]
)
async def test_branch_has_exactly_one_outcome(action, children):
    with pytest.raises(ValidationError, match="action_or_subtree"):
        AutomationBranch(action=action, branches=children)


# The gates, counters and attribution a mutation review found unpinned.


async def test_disable_stays_stopped_in_process_when_persistence_fails(engine):
    """Fail closed: the listener is gone and the gate is shut even though the
    deactivation could not be persisted."""
    service, action, storage, _ = engine
    trigger = service._providers["test"]  # noqa: SLF001
    created = await service.create(
        AutomationCreate(
            name="disable", trigger=TRIGGER, branches=[AutomationBranch(action=ACTION)]
        ),
        created_by="user",
    )
    storage.update.side_effect = RuntimeError("db down")
    with pytest.raises(RuntimeError, match="db down"):
        await service.disable(created.id, reason="Maintenance", actor_id="operator")
    stopped = await service.get(created.id)
    assert not stopped.enabled
    assert stopped.deactivation is not None
    assert stopped.deactivation.reason == "Maintenance"
    trigger.unregister.assert_awaited_once_with("listener")
    await fire(service, created)
    action.execute.assert_not_awaited()


async def test_gate_is_shut_before_the_listener_is_unregistered(engine):
    """An event still in flight while the listener is torn down finds the
    automation already disabled."""
    service, action, _, _ = engine
    trigger = service._providers["test"]  # noqa: SLF001
    created = await service.create(
        AutomationCreate(
            name="disable", trigger=TRIGGER, branches=[AutomationBranch(action=ACTION)]
        ),
        created_by="user",
    )
    seen: dict[str, bool] = {}

    async def unregister(_handle: str) -> None:
        seen["enabled"] = (await service.get(created.id)).enabled
        await fire(service, created)

    trigger.unregister.side_effect = unregister
    await service.disable(created.id, reason="Maintenance", actor_id="operator")
    assert seen["enabled"] is False
    action.execute.assert_not_awaited()


async def test_enable_restarts_the_consecutive_failure_count(engine):
    """After a trip on failures, one failure following the resume is one
    failure, not the third: the counter went with the deactivation."""
    service, action, storage, _ = engine
    action.execute.side_effect = RuntimeError("private backend error")
    created = await service.create(
        AutomationCreate(
            name="failure",
            trigger=TRIGGER,
            branches=[AutomationBranch(action=ACTION)],
            guardrails=AutomationGuardrails(max_consecutive_failures=2),
        ),
        created_by="user",
    )
    for _ in range(2):
        await fire(service, created)
    assert (await service.get(created.id)).deactivation.reason == (
        "consecutive_failures"
    )
    await service.enable(created.id)
    await fire(service, created)
    resumed = await service.get(created.id)
    assert resumed.enabled
    assert resumed.deactivation is None
    assert storage.log_execution.call_args.args[0].status == ExecutionStatus.FAILED


async def test_breaker_trip_is_attributed_to_the_system(engine):
    service, _, _, _ = engine
    created = await service.create(
        AutomationCreate(
            name="rate",
            trigger=TRIGGER,
            branches=[AutomationBranch(action=ACTION)],
            guardrails=AutomationGuardrails(max_executions=1),
        ),
        created_by="user",
    )
    await fire(service, created)
    await fire(service, created)
    tripped = (await service.get(created.id)).deactivation
    assert tripped is not None
    assert tripped.source == "circuit_breaker"
    assert tripped.actor_id == "system"
    assert tripped.reason == "execution_rate_exceeded"


async def test_an_event_without_a_device_skips_the_feedback_check(engine):
    """No event point, nothing to feed back into: the writes are not described."""
    service, action, _, _ = engine
    created = await service.create(
        AutomationCreate(
            name="schedule", trigger=TRIGGER, branches=[AutomationBranch(action=ACTION)]
        ),
        created_by="user",
    )
    event = TriggerContext(timestamp=EVENT.timestamp)
    await service._make_on_fire(created.id)(event)  # noqa: SLF001
    action.execute.assert_awaited_once_with({}, event)
    action.describe_writes.assert_not_awaited()
