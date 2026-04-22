from __future__ import annotations

from datetime import UTC, datetime

import pytest
from automations.models import (
    Automation,
    AutomationCreate,
    AutomationExecution,
    AutomationUpdate,
    ChangeEventTrigger,
    ComparisonOperator,
    Condition,
    ConditionTarget,
    ExecutionStatus,
    ScheduleTrigger,
    Trigger,
    TriggerType,
)
from pydantic import TypeAdapter, ValidationError

_trigger_adapter = TypeAdapter(Trigger)


class TestValidation:
    def test_invalid_operator_raises(self):
        with pytest.raises(ValidationError):
            Condition(operator="between", operand=25)  # type: ignore[arg-type]

    def test_invalid_trigger_type_literal_raises(self):
        with pytest.raises(ValidationError):
            ScheduleTrigger(cron="0 11 * * *", type=TriggerType.CHANGE_EVENT)  # type: ignore[arg-type]

    def test_unknown_trigger_type_raises(self):
        with pytest.raises(ValidationError):
            _trigger_adapter.validate_python({"type": "webhook", "cron": "* * * * *"})

    def test_trigger_from_dict_schedule(self):
        t = _trigger_adapter.validate_python({"type": "schedule", "cron": "0 11 * * *"})
        assert isinstance(t, ScheduleTrigger)

    def test_trigger_from_dict_change_event(self):
        t = _trigger_adapter.validate_python(
            {"type": "change_event", "source_id": "s1", "event_type": "temperature"}
        )
        assert isinstance(t, ChangeEventTrigger)


class TestAutomationUseCases:
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
            name=name, trigger=trigger, action_template_id="tmpl-01"
        )
        assert automation.trigger == trigger

    def test_automation_id(self):
        a = Automation(
            name="test",
            trigger=ScheduleTrigger(cron="0 * * * *"),
            action_template_id="tmpl-01",
            id="abc123def456abcd",
        )
        assert a.id == "abc123def456abcd"


class TestAutomationUpdate:
    def test_all_fields_optional(self):
        u = AutomationUpdate()
        assert u.name is None
        assert u.trigger is None
        assert u.action_template_id is None
        assert u.enabled is None

    def test_name_only(self):
        u = AutomationUpdate(name="renamed")
        assert u.name == "renamed"
        assert u.trigger is None

    def test_trigger_only(self):
        u = AutomationUpdate(trigger=ScheduleTrigger(cron="0 12 * * *"))
        assert isinstance(u.trigger, ScheduleTrigger)
        assert u.name is None

    def test_enabled_only(self):
        u = AutomationUpdate(enabled=False)
        assert u.enabled is False
        assert u.name is None


class TestAutomationExecution:
    def test_defaults(self):
        e = AutomationExecution(
            id="exec-01",
            automation_id="auto-01",
            triggered_at=datetime(2024, 1, 1, tzinfo=UTC),
            status=ExecutionStatus.SUCCESS,
        )
        assert e.executed_at is None
        assert e.error is None
        assert e.output_id is None

    def test_output_id_stored(self):
        e = AutomationExecution(
            id="exec-02",
            automation_id="auto-01",
            triggered_at=datetime(2024, 1, 1, tzinfo=UTC),
            status=ExecutionStatus.SUCCESS,
            output_id="batch-cmd-abc123",
        )
        assert e.output_id == "batch-cmd-abc123"

    def test_failed_with_error(self):
        e = AutomationExecution(
            id="exec-03",
            automation_id="auto-01",
            triggered_at=datetime(2024, 1, 1, tzinfo=UTC),
            status=ExecutionStatus.FAILED,
            error="timeout",
        )
        assert e.status == ExecutionStatus.FAILED
        assert e.error == "timeout"
        assert e.output_id is None
