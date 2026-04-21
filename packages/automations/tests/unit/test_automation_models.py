from __future__ import annotations

import pytest
from automations.models import (
    ActionSpec,
    Automation,
    AutomationCreate,
    ChangeEventTrigger,
    ComparisonOperator,
    Condition,
    ConditionTarget,
    ScheduleTrigger,
    Trigger,
    TriggerType,
)
from pydantic import TypeAdapter, ValidationError

_trigger_adapter = TypeAdapter(Trigger)


def _action() -> ActionSpec:
    return ActionSpec(provider_id="commands", template_id="tmpl-01")


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
        automation = AutomationCreate(name=name, trigger=trigger, actions=[_action()])
        assert automation.trigger == trigger

    def test_multiple_actions(self):
        automation = AutomationCreate(
            name="alert_and_clamp",
            trigger=ChangeEventTrigger(source_id="src-01", event_type="temperature"),
            actions=[
                ActionSpec(provider_id="commands", template_id="clamp-tmpl"),
                ActionSpec(provider_id="notifications", template_id="alert-email"),
            ],
        )
        assert len(automation.actions) == 2

    def test_automation_id(self):
        a = Automation(
            name="test",
            trigger=ScheduleTrigger(cron="0 * * * *"),
            actions=[_action()],
            id="abc123def456abcd",
        )
        assert a.id == "abc123def456abcd"
