from __future__ import annotations

from datetime import datetime  # noqa: TC003
from enum import StrEnum

from pydantic import BaseModel, Field


class ExecutionStatus(StrEnum):
    SUCCESS = "success"
    FAILED = "failed"


class Trigger(BaseModel):
    provider_id: str
    params: dict = Field(default_factory=dict)


class Action(BaseModel):
    provider_id: str
    params: dict = Field(default_factory=dict)


class TriggerContext(BaseModel):
    timestamp: datetime


class AutomationCreate(BaseModel):
    name: str
    description: str = ""
    trigger: Trigger
    action: Action
    enabled: bool = True


class AutomationUpdate(BaseModel):
    name: str | None = None
    description: str = ""
    trigger: Trigger | None = None
    action: Action | None = None
    enabled: bool | None = None


class Automation(AutomationCreate):
    id: str = ""

    def apply_update(self, params: AutomationUpdate) -> Automation:
        return self.model_copy(
            update={k: getattr(params, k) for k in params.model_fields_set}
        )


class AutomationExecution(BaseModel):
    id: str
    automation_id: str
    triggered_at: datetime
    executed_at: datetime | None = None
    status: ExecutionStatus
    error: str | None = None
    output_id: str | None = None
