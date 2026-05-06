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

_SCHEDULE = Trigger(provider_id="schedule", params={"cron": "0 11 * * *"})
_CHANGE_TEMP = Trigger(
    provider_id="change_event",
    params={"source_id": "src-01", "event_type": "temperature"},
)
_CHANGE_MODE = Trigger(
    provider_id="change_event",
    params={"source_id": "src-01", "event_type": "mode"},
)
_CHANGE_OCC = Trigger(
    provider_id="change_event",
    params={"source_id": "src-01", "event_type": "occupancy"},
)

_CMD_ACTION = Action(provider_id="command_template", params={"template_id": "tmpl-01"})
_NOTIF_ACTION = Action(
    provider_id="notification",
    params={
        "title": "Hot!",
        "body": "Too hot",
        "severity": "alert",
        "user_ids": ["u1"],
    },
)


class TestAction:
    def test_provider_id_and_params_roundtrip(self):
        a = Action(provider_id="command_template", params={"template_id": "tmpl-01"})
        assert a.provider_id == "command_template"
        assert a.params == {"template_id": "tmpl-01"}

    def test_params_defaults_to_empty_dict(self):
        a = Action(provider_id="webhook")
        assert a.params == {}

    def test_model_dump(self):
        a = Action(provider_id="notification", params={"title": "Hot!"})
        assert a.model_dump() == {
            "provider_id": "notification",
            "params": {"title": "Hot!"},
        }


class TestTrigger:
    def test_provider_id_and_params_roundtrip(self):
        t = Trigger(provider_id="schedule", params={"cron": "0 11 * * *"})
        assert t.provider_id == "schedule"
        assert t.params == {"cron": "0 11 * * *"}

    def test_params_defaults_to_empty_dict(self):
        t = Trigger(provider_id="schedule")
        assert t.params == {}

    def test_model_dump(self):
        t = Trigger(provider_id="change_event", params={"device_id": "d1"})
        assert t.model_dump() == {
            "provider_id": "change_event",
            "params": {"device_id": "d1"},
        }


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
            trigger=_SCHEDULE,
            action=_CMD_ACTION,
            id="abc123def456abcd",
        )
        assert a.id == "abc123def456abcd"

    def test_automation_with_notification_action(self):
        a = AutomationCreate(name="notif", trigger=_SCHEDULE, action=_NOTIF_ACTION)
        assert a.action.provider_id == "notification"

    def test_automation_metadata_defaults(self):
        a = Automation(name="test", trigger=_SCHEDULE, action=_CMD_ACTION)
        assert a.created_by == ""
        assert a.created_at <= a.updated_at

    def test_apply_update_bumps_updated_at(self):
        before = datetime(2024, 1, 1, tzinfo=UTC)
        a = Automation(
            name="test",
            trigger=_SCHEDULE,
            action=_CMD_ACTION,
            created_at=before,
            updated_at=before,
        )
        updated = a.apply_update(AutomationUpdate(name="renamed"))
        assert updated.name == "renamed"
        assert updated.updated_at > before
        assert updated.created_at == before

    def test_apply_update_is_noop_when_no_fields_set(self):
        before = datetime(2024, 1, 1, tzinfo=UTC)
        a = Automation(
            name="test",
            trigger=_SCHEDULE,
            action=_CMD_ACTION,
            created_at=before,
            updated_at=before,
        )
        result = a.apply_update(AutomationUpdate())
        assert result is a


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
            trigger=Trigger(provider_id="schedule", params={"cron": "0 12 * * *"})
        )
        assert u.trigger is not None
        assert u.trigger.provider_id == "schedule"
        assert u.name is None

    def test_action_only(self):
        u = AutomationUpdate(action=_CMD_ACTION)
        assert u.action is not None
        assert u.action.provider_id == "command_template"
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
