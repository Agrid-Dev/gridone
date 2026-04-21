from __future__ import annotations

import dataclasses
from datetime import UTC, datetime

import pytest
from automations.models import (
    ActionSpec,
    Automation,
    AutomationCreate,
    AutomationExecution,
    ChangeEventTrigger,
    ComparisonOperator,
    Condition,
    ConditionTarget,
    ExecutionStatus,
    ScheduleTrigger,
    Trigger,
    TriggerContext,
    TriggerType,
    trigger_from_dict,
)


def _actions(*template_ids: str, provider: str = "commands") -> list[ActionSpec]:
    return [ActionSpec(provider_id=provider, template_id=tid) for tid in template_ids]


def _now() -> datetime:
    return datetime(2026, 1, 1, 12, 0, tzinfo=UTC)


class TestEnums:
    @pytest.mark.parametrize("value", list(TriggerType))
    def test_trigger_type_valid(self, value: TriggerType):
        assert TriggerType(value) == value

    @pytest.mark.parametrize("value", list(ComparisonOperator))
    def test_comparison_operator_valid(self, value: ComparisonOperator):
        assert ComparisonOperator(value) == value

    @pytest.mark.parametrize("value", list(ConditionTarget))
    def test_condition_target_valid(self, value: ConditionTarget):
        assert ConditionTarget(value) == value

    @pytest.mark.parametrize("value", list(ExecutionStatus))
    def test_execution_status_valid(self, value: ExecutionStatus):
        assert ExecutionStatus(value) == value

    @pytest.mark.parametrize(
        ("enum_class", "bad_value"),
        [
            (TriggerType, "bad"),
            (ComparisonOperator, "between"),
            (ConditionTarget, "next_value"),
            (ExecutionStatus, "pending"),
        ],
    )
    def test_invalid_value_raises(self, enum_class, bad_value):
        with pytest.raises(ValueError, match=bad_value):
            enum_class(bad_value)


class TestActionSpec:
    def test_construction(self):
        a = ActionSpec(provider_id="commands", template_id="tmp-01")
        assert a.provider_id == "commands"
        assert a.template_id == "tmp-01"

    def test_different_provider(self):
        a = ActionSpec(provider_id="notifications", template_id="abc")
        assert a.provider_id == "notifications"


class TestCondition:
    def test_default_target_is_value(self):
        c = Condition(operator=ComparisonOperator.GT, operand=25)
        assert c.target == ConditionTarget.VALUE

    def test_previous_value_target(self):
        c = Condition(
            operator=ComparisonOperator.EQ,
            operand=1,
            target=ConditionTarget.PREVIOUS_VALUE,
        )
        assert c.target == ConditionTarget.PREVIOUS_VALUE
        assert c.operand == 1

    @pytest.mark.parametrize("operator", list(ComparisonOperator))
    def test_all_operators(self, operator: ComparisonOperator):
        Condition(operator=operator, operand=0)


class TestTriggers:
    def test_schedule_trigger(self):
        t = ScheduleTrigger(cron="0 11 * * *")
        assert t.cron == "0 11 * * *"
        assert t.type == TriggerType.SCHEDULE

    def test_change_event_trigger_no_condition(self):
        t = ChangeEventTrigger(source_id="src-01", event_type="temperature")
        assert t.source_id == "src-01"
        assert t.event_type == "temperature"
        assert t.condition is None
        assert t.type == TriggerType.CHANGE_EVENT

    def test_change_event_trigger_with_condition(self):
        c = Condition(operator=ComparisonOperator.GT, operand=25)
        t = ChangeEventTrigger(
            source_id="src-01", event_type="temperature", condition=c
        )
        assert t.condition == c

    def test_trigger_from_dict_schedule(self):
        data: dict[str, object] = {"type": "schedule", "cron": "0 11 * * *"}
        t = trigger_from_dict(data)
        assert isinstance(t, ScheduleTrigger)
        assert t.cron == "0 11 * * *"

    def test_trigger_from_dict_change_event(self):
        data: dict[str, object] = {
            "type": "change_event",
            "source_id": "src-01",
            "event_type": "temperature",
        }
        t = trigger_from_dict(data)
        assert isinstance(t, ChangeEventTrigger)
        assert t.source_id == "src-01"
        assert t.condition is None

    def test_trigger_from_dict_change_event_with_condition(self):
        data: dict[str, object] = {
            "type": "change_event",
            "source_id": "src-01",
            "event_type": "temperature",
            "condition": {"operator": "gt", "operand": 25},
        }
        t = trigger_from_dict(data)
        assert isinstance(t, ChangeEventTrigger)
        assert t.condition is not None
        assert t.condition.operator == ComparisonOperator.GT
        assert t.condition.operand == 25
        assert t.condition.target == ConditionTarget.VALUE

    def test_trigger_roundtrip_schedule(self):
        original = ScheduleTrigger(cron="*/5 * * * *")
        restored = trigger_from_dict(dataclasses.asdict(original))
        assert restored == original

    def test_trigger_roundtrip_change_event(self):
        original = ChangeEventTrigger(
            source_id="src-02",
            event_type="mode",
            condition=Condition(operator=ComparisonOperator.EQ, operand="cool"),
        )
        restored = trigger_from_dict(dataclasses.asdict(original))
        assert restored == original

    def test_invalid_trigger_type_raises(self):
        with pytest.raises(ValueError, match="webhook"):
            trigger_from_dict({"type": "webhook", "url": "http://example.com"})


class TestAGR290UseCases:
    @pytest.mark.parametrize(
        ("name", "trigger"),
        [
            (
                "alert_temp_gt_25",
                ChangeEventTrigger(
                    source_id="src-01",
                    event_type="temperature",
                    condition=Condition(operator=ComparisonOperator.GT, operand=25),
                ),
            ),
            (
                "setpoint_clamp",
                ChangeEventTrigger(
                    source_id="src-01",
                    event_type="setpoint",
                    condition=Condition(operator=ComparisonOperator.GT, operand=25),
                ),
            ),
            (
                "mode_lock_cool_to_heat",
                ChangeEventTrigger(
                    source_id="src-01",
                    event_type="mode",
                    condition=Condition(operator=ComparisonOperator.EQ, operand="cool"),
                ),
            ),
            (
                "mode_propagation",
                ChangeEventTrigger(source_id="src-01", event_type="mode"),
            ),
            (
                "schedule_off_at_11am",
                ScheduleTrigger(cron="0 11 * * *"),
            ),
            (
                "occupancy_1_to_0",
                ChangeEventTrigger(
                    source_id="src-01",
                    event_type="occupancy",
                    condition=Condition(
                        operator=ComparisonOperator.EQ,
                        operand=1,
                        target=ConditionTarget.PREVIOUS_VALUE,
                    ),
                ),
            ),
        ],
    )
    def test_use_case(self, name: str, trigger: Trigger):
        automation = AutomationCreate(
            name=name,
            trigger=trigger,
            actions=_actions("tmpl-01"),
        )
        assert automation.name == name
        assert automation.enabled is True

    def test_multiple_actions(self):
        automation = AutomationCreate(
            name="alert_and_clamp",
            trigger=ChangeEventTrigger(
                source_id="src-01",
                event_type="temperature",
                condition=Condition(operator=ComparisonOperator.GT, operand=25),
            ),
            actions=[
                ActionSpec(provider_id="commands", template_id="setpoint-clamp"),
                ActionSpec(provider_id="notifications", template_id="temp-alert-email"),
            ],
        )
        assert len(automation.actions) == 2
        assert automation.actions[0].provider_id == "commands"
        assert automation.actions[1].provider_id == "notifications"


class TestAutomation:
    def test_inherits_automation_create(self):
        a = Automation(
            name="test",
            trigger=ScheduleTrigger(cron="0 * * * *"),
            actions=_actions("tmpl-01"),
            id="abc123def456abcd",
        )
        assert a.id == "abc123def456abcd"
        assert a.enabled is True

    def test_default_id_is_empty(self):
        a = Automation(
            name="test",
            trigger=ScheduleTrigger(cron="0 * * * *"),
            actions=_actions("tmpl-01"),
        )
        assert a.id == ""


class TestTriggerContext:
    def test_minimal(self):
        ctx = TriggerContext(timestamp=_now())
        assert ctx.value is None
        assert ctx.previous_value is None

    def test_with_values(self):
        ctx = TriggerContext(timestamp=_now(), value=25, previous_value=20)
        assert ctx.value == 25
        assert ctx.previous_value == 20


class TestAutomationExecution:
    @pytest.mark.parametrize("status", list(ExecutionStatus))
    def test_all_statuses(self, status: ExecutionStatus):
        ex = AutomationExecution(
            id="exec0001",
            automation_id="auto0001",
            triggered_at=_now(),
            status=status,
        )
        assert ex.status == status
        assert ex.executed_at is None
        assert ex.error is None

    def test_with_error(self):
        ex = AutomationExecution(
            id="exec0002",
            automation_id="auto0001",
            triggered_at=_now(),
            status=ExecutionStatus.FAILED,
            error="provider unreachable",
        )
        assert ex.error == "provider unreachable"
