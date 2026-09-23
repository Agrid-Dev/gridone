"""Compatibility, ordered evaluation and fail-closed execution safeguards."""

import asyncio
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from automations.errors import AutomationLoopError
from automations.models import (
    Action,
    Automation,
    AutomationBranch,
    AutomationCreate,
    AutomationGuardrails,
    AutomationUpdate,
    ExecutionStatus,
    Trigger,
    TriggerContext,
)
from automations.service import AutomationsService
from automations.storage.backend import AutomationsStorageBackend
from pydantic import BaseModel, ValidationError

from models.attribute_observation import AttributeObservation
from models.errors import InvalidError, SchemaValidationError
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


async def test_legacy_payload_roundtrip_and_update(engine):
    service, action, storage, _ = engine
    created = await service.create(
        AutomationCreate(name="legacy", trigger=TRIGGER, action=ACTION),
        created_by="user",
    )
    assert len(created.branches) == 1
    assert created.branches[0].condition is None
    restored = Automation.model_validate_json(created.model_dump_json())
    assert restored.branches == created.branches
    await fire(service, created)
    action.execute.assert_awaited_once_with({}, EVENT)
    assert storage.log_execution.call_args.args[0].context == EVENT
    updated = await service.update(
        created.id, AutomationUpdate(action=Action(provider_id="test", params={"x": 1}))
    )
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
        AutomationCreate(name="initial", trigger=TRIGGER, action=ACTION),
        created_by="user",
    )
    await service._make_on_fire(created.id)(  # noqa: SLF001
        EVENT.model_copy(update={"is_initial": True, "has_previous": False})
    )
    action.execute.assert_not_awaited()
    assert storage.log_execution.call_args.args[0].status == ExecutionStatus.INITIALIZED
    await fire(service, created)
    action.execute.assert_awaited_once()


async def test_suspension_persists_and_resume_does_not_fire(engine):
    service, action, storage, _ = engine
    created = await service.create(
        AutomationCreate(name="suspend", trigger=TRIGGER, action=ACTION),
        created_by="user",
    )
    suspended = await service.suspend(
        created.id, reason="Maintenance", actor_id="operator"
    )
    assert suspended.suspension.actor_id == "operator"
    assert not suspended.enabled
    assert (
        await service.suspend(created.id, reason="Second request", actor_id="other")
        == suspended
    )
    storage.update.assert_awaited_with(suspended)
    await fire(service, created)
    action.execute.assert_not_awaited()
    with pytest.raises(InvalidError, match="explicitly"):
        await service.update(created.id, AutomationUpdate(enabled=True))
    resumed = await service.enable(created.id)
    assert resumed.enabled
    assert resumed.suspension is None
    action.execute.assert_not_awaited()
    await fire(service, resumed)
    action.execute.assert_awaited_once()


async def test_indirect_feedback_stops_at_configured_limit(engine):
    service, action, storage, _ = engine
    created = await service.create(
        AutomationCreate(
            name="loop",
            trigger=TRIGGER,
            action=ACTION,
            guardrails=AutomationGuardrails(max_executions=2),
        ),
        created_by="user",
    )
    for _ in range(5):
        await fire(service, created)
    assert action.execute.await_count == 2
    stopped = await service.get(created.id)
    assert stopped.suspension.source == "circuit_breaker"
    assert stopped.suspension.reason == "execution_rate_exceeded"
    assert storage.log_execution.call_args.args[0].status == ExecutionStatus.SUSPENDED
    await service.enable(created.id)
    await fire(service, created)
    assert action.execute.await_count == 3


async def test_concurrent_execution_suspends_instead_of_overlapping(engine):
    service, action, _, _ = engine
    started, finish = asyncio.Event(), asyncio.Event()

    async def execute(*_args: object) -> None:
        started.set()
        await finish.wait()

    action.execute.side_effect = execute
    created = await service.create(
        AutomationCreate(name="overlap", trigger=TRIGGER, action=ACTION),
        created_by="user",
    )
    task = asyncio.create_task(fire(service, created))
    await started.wait()
    try:
        await fire(service, created)
        assert (
            await service.get(created.id)
        ).suspension.reason == "overlapping_execution"
        action.execute.assert_awaited_once()
    finally:
        finish.set()
        await task


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
    assert (await service.get(created.id)).suspension.reason == "consecutive_failures"
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
        action=ACTION,
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


async def test_rate_window_expires_without_suspension(engine, monkeypatch):
    service, action, _, _ = engine
    now = MagicMock(return_value=1)
    monkeypatch.setattr("automations.service.monotonic", now)
    created = await service.create(
        AutomationCreate(
            name="cadence",
            trigger=TRIGGER,
            action=ACTION,
            guardrails=AutomationGuardrails(max_executions=1, window_seconds=10),
        ),
        created_by="user",
    )
    await fire(service, created)
    now.return_value = 11
    await fire(service, created)
    assert action.execute.await_count == 2
    assert (await service.get(created.id)).enabled


async def test_failed_resume_retains_suspension(engine):
    service, action, _, _ = engine
    created = await service.create(
        AutomationCreate(name="resume", trigger=TRIGGER, action=ACTION),
        created_by="user",
    )
    suspended = await service.suspend(
        created.id, reason="Maintenance", actor_id="operator"
    )
    service._providers["test"].register.side_effect = RuntimeError("unavailable")  # noqa: SLF001
    with pytest.raises(RuntimeError, match="unavailable"):
        await service.enable(created.id)
    assert await service.get(created.id) == suspended
    action.execute.assert_not_awaited()


async def test_legacy_update_cannot_replace_multi_branch_tree(engine):
    service, _, _, _ = engine
    created = await service.create(
        AutomationCreate(
            name="tree",
            trigger=TRIGGER,
            branches=[branch("a", value=True), branch("b", value=False)],
        ),
        created_by="user",
    )
    with pytest.raises(InvalidError, match="Invalid automation update"):
        await service.update(created.id, AutomationUpdate(action=ACTION))
    assert (await service.get(created.id)).branches == created.branches


async def test_direct_feedback_suspends_with_visible_cause(engine):
    service, action, storage, _ = engine
    action.execute.side_effect = AutomationLoopError("direct_feedback")
    created = await service.create(
        AutomationCreate(name="feedback", trigger=TRIGGER, action=ACTION),
        created_by="user",
    )
    await fire(service, created)
    suspended = await service.get(created.id)
    assert suspended.suspension.source == "circuit_breaker"
    assert suspended.suspension.reason == "direct_feedback"
    assert storage.log_execution.call_args.args[0].status == ExecutionStatus.SUSPENDED
    await fire(service, created)
    action.execute.assert_awaited_once()


async def test_reordering_updates_compatibility_action_and_diagnostics(engine):
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
    assert updated.action == second.action
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
    assert created.action == leaf.action


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


async def test_legacy_action_update_cannot_collapse_a_subtree(engine):
    service, _, _, _ = engine
    created = await service.create(
        AutomationCreate(
            name="nested",
            trigger=TRIGGER,
            branches=[AutomationBranch(branches=[AutomationBranch(action=ACTION)])],
        ),
        created_by="user",
    )
    with pytest.raises(InvalidError):
        await service.update(created.id, AutomationUpdate(action=ACTION))
