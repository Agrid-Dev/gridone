from __future__ import annotations

from datetime import datetime  # noqa: TC003
from enum import StrEnum
from typing import Annotated, Literal

from pydantic import BaseModel, Field

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


class Condition(BaseModel):
    """Compares a field of the trigger event payload against an operand."""

    operator: ComparisonOperator
    operand: AttributeValueType
    target: ConditionTarget = ConditionTarget.VALUE


class ScheduleTrigger(BaseModel):
    type: Literal[TriggerType.SCHEDULE] = TriggerType.SCHEDULE
    cron: str


class ChangeEventTrigger(BaseModel):
    type: Literal[TriggerType.CHANGE_EVENT] = TriggerType.CHANGE_EVENT
    source_id: str
    event_type: str
    condition: Condition | None = None


Trigger = Annotated[
    ScheduleTrigger | ChangeEventTrigger,
    Field(discriminator="type"),
]


class TriggerContext(BaseModel):
    """Domain-agnostic payload built by the listener when a trigger fires.

    Lives in automations so this package never imports devices_manager.
    """

    timestamp: datetime
    value: AttributeValueType | None = None
    previous_value: AttributeValueType | None = None


class AutomationCreate(BaseModel):
    name: str
    trigger: Trigger
    action_template_id: str
    enabled: bool = True


class AutomationUpdate(BaseModel):
    name: str | None = None
    trigger: Trigger | None = None
    action_template_id: str | None = None
    enabled: bool | None = None


class Automation(AutomationCreate):
    id: str = ""


class AutomationExecution(BaseModel):
    id: str
    automation_id: str
    triggered_at: datetime
    executed_at: datetime | None = None
    status: ExecutionStatus
    error: str | None = None
    output_id: str | None = None
