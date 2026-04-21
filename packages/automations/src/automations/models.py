from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime  # noqa: TC003
from enum import StrEnum
from typing import Literal, cast

from models.types import AttributeValueType  # noqa: TC001


class TriggerType(StrEnum):
    SCHEDULE = "schedule"
    CHANGE_EVENT = "change_event"


class ComparisonOperator(StrEnum):
    GT = "gt"
    LT = "lt"
    GTE = "gte"
    LTE = "lte"
    EQ = "eq"
    NEQ = "neq"


class ConditionTarget(StrEnum):
    VALUE = "value"
    PREVIOUS_VALUE = "previous_value"


class ExecutionStatus(StrEnum):
    SUCCESS = "success"
    FAILED = "failed"
    SKIPPED = "skipped"


@dataclass
class ActionSpec:
    """Reference to a provider action to execute when an automation fires.

    Automations never inspect the action payload — the provider resolves it.
    """

    provider_id: str
    template_id: str


@dataclass
class Condition:
    """Compares a field of the trigger event payload against an operand."""

    operator: ComparisonOperator
    operand: AttributeValueType
    target: ConditionTarget = ConditionTarget.VALUE


@dataclass
class ScheduleTrigger:
    """Fires on a cron schedule (apscheduler crontab syntax, e.g. "0 11 * * *")."""

    cron: str
    type: Literal[TriggerType.SCHEDULE] = TriggerType.SCHEDULE


@dataclass
class ChangeEventTrigger:
    source_id: str
    event_type: str
    condition: Condition | None = None
    type: Literal[TriggerType.CHANGE_EVENT] = TriggerType.CHANGE_EVENT


Trigger = ScheduleTrigger | ChangeEventTrigger


@dataclass
class TriggerContext:
    """Domain-agnostic payload built by the listener when a trigger fires.

    Lives in automations so this package never imports devices_manager.
    """

    timestamp: datetime
    value: AttributeValueType | None = None
    previous_value: AttributeValueType | None = None


@dataclass
class AutomationCreate:
    name: str
    trigger: Trigger
    actions: list[ActionSpec]
    enabled: bool = True


@dataclass
class Automation(AutomationCreate):
    id: str = field(default="")


@dataclass
class AutomationExecution:
    id: str
    automation_id: str
    triggered_at: datetime
    status: ExecutionStatus
    executed_at: datetime | None = None
    error: str | None = None


def trigger_from_dict(data: dict[str, object]) -> Trigger:
    """Deserialise a trigger dict by dispatching on the 'type' field.

    Example: {"type": "schedule", "cron": "0 11 * * *"} -> ScheduleTrigger
    Example: {"type": "change_event", "source_id": "s1", "event_type": "temperature"}
    """
    trigger_type = TriggerType(cast("str", data["type"]))
    if trigger_type == TriggerType.SCHEDULE:
        return ScheduleTrigger(cron=cast("str", data["cron"]))
    condition_raw = cast("dict[str, object] | None", data.get("condition"))
    condition = (
        Condition(
            operator=ComparisonOperator(cast("str", condition_raw["operator"])),
            operand=cast("AttributeValueType", condition_raw["operand"]),
            target=ConditionTarget(
                cast("str", condition_raw.get("target", ConditionTarget.VALUE))
            ),
        )
        if condition_raw
        else None
    )
    return ChangeEventTrigger(
        source_id=cast("str", data["source_id"]),
        event_type=cast("str", data["event_type"]),
        condition=condition,
    )
