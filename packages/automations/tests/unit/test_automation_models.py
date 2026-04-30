from __future__ import annotations

from datetime import UTC, datetime

import pytest
from automations.models import (
    Action,
    Automation,
    AutomationCreate,
    AutomationExecution,
    AutomationUpdate,
    ExecutionStatus,
    Trigger,
)

_SCHEDULE = Trigger.model_validate({"type": "schedule", "cron": "0 11 * * *"})
_CHANGE_TEMP = Trigger.model_validate(
    {"type": "change_event", "source_id": "src-01", "event_type": "temperature"}
)
_CHANGE_MODE = Trigger.model_validate(
    {"type": "change_event", "source_id": "src-01", "event_type": "mode"}
)
_CHANGE_OCC = Trigger.model_validate(
    {"type": "change_event", "source_id": "src-01", "event_type": "occupancy"}
)

_CMD_ACTION = Action.model_validate(
    {"type": "command_template", "template_id": "tmpl-01"}
)
_NOTIF_ACTION = Action.model_validate(
    {
        "type": "notification",
        "title": "Hot!",
        "body": "Too hot",
        "severity": "alert",
        "user_ids": ["u1"],
    }
)


class TestAction:
    def test_type_field_required(self):
        a = Action.model_validate(
            {"type": "command_template", "template_id": "tmpl-01"}
        )
        assert a.type == "command_template"

    def test_extra_fields_preserved(self):
        a = Action.model_validate(
            {"type": "notification", "title": "Hot!", "severity": "alert"}
        )
        assert a.model_dump() == {
            "type": "notification",
            "title": "Hot!",
            "severity": "alert",
        }

    def test_dump_excludes_type(self):
        a = Action.model_validate(
            {"type": "command_template", "template_id": "tmpl-01"}
        )
        dumped = a.model_dump(exclude={"type"})
        assert dumped == {"template_id": "tmpl-01"}
        assert "type" not in dumped

    def test_any_type_string_accepted(self):
        a = Action.model_validate({"type": "webhook", "url": "https://example.com"})
        assert a.type == "webhook"


class TestTrigger:
    def test_type_field_required(self):
        t = Trigger.model_validate({"type": "schedule", "cron": "0 11 * * *"})
        assert t.type == "schedule"

    def test_extra_fields_preserved(self):
        t = Trigger.model_validate(
            {"type": "change_event", "source_id": "dev-01", "event_type": "temperature"}
        )
        assert t.model_dump() == {
            "type": "change_event",
            "source_id": "dev-01",
            "event_type": "temperature",
        }

    def test_dump_excludes_type(self):
        t = Trigger.model_validate({"type": "schedule", "cron": "0 11 * * *"})
        assert t.model_dump(exclude={"type"}) == {"cron": "0 11 * * *"}

    def test_any_type_string_accepted(self):
        t = Trigger.model_validate({"type": "webhook", "url": "https://example.com"})
        assert t.type == "webhook"


class TestAutomationUseCases:
    @pytest.mark.parametrize(
        ("name", "trigger"),
        [
            ("alert_temp", _CHANGE_TEMP),
            ("mode_propagation", _CHANGE_MODE),
            ("schedule_off_at_11am", _SCHEDULE),
            ("occupancy", _CHANGE_OCC),
        ],
    )
    def test_use_case(self, name: str, trigger: Trigger):
        automation = AutomationCreate(name=name, trigger=trigger, action=_CMD_ACTION)
        assert automation.trigger == trigger

    def test_automation_id(self):
        a = Automation(
            name="test",
            trigger=Trigger.model_validate({"type": "schedule", "cron": "0 * * * *"}),
            action=_CMD_ACTION,
            id="abc123def456abcd",
        )
        assert a.id == "abc123def456abcd"

    def test_automation_with_notification_action(self):
        a = AutomationCreate(name="notif", trigger=_SCHEDULE, action=_NOTIF_ACTION)
        assert a.action.type == "notification"


class TestAutomationCreateDescription:
    def test_description_defaults_to_empty_string(self):
        a = AutomationCreate(name="my-auto", trigger=_SCHEDULE, action=_CMD_ACTION)
        assert a.description == ""

    def test_description_can_be_set(self):
        a = AutomationCreate(
            name="my-auto",
            description="Some info",
            trigger=_SCHEDULE,
            action=_CMD_ACTION,
        )
        assert a.description == "Some info"


class TestAutomationUpdate:
    def test_all_fields_optional(self):
        u = AutomationUpdate()
        assert u.name is None
        assert u.description == ""
        assert u.trigger is None
        assert u.action is None
        assert u.enabled is None

    def test_description_omitted_not_in_fields_set(self):
        u = AutomationUpdate()
        assert "description" not in u.model_fields_set

    def test_name_only(self):
        u = AutomationUpdate(name="renamed")
        assert u.name == "renamed"
        assert u.trigger is None

    def test_description_only(self):
        u = AutomationUpdate(description="Some description")
        assert u.description == "Some description"
        assert u.name is None

    def test_trigger_only(self):
        u = AutomationUpdate(
            trigger=Trigger.model_validate({"type": "schedule", "cron": "0 12 * * *"})
        )
        assert u.trigger is not None
        assert u.trigger.type == "schedule"
        assert u.name is None

    def test_action_only(self):
        u = AutomationUpdate(action=_CMD_ACTION)
        assert u.action is not None
        assert u.action.type == "command_template"
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
