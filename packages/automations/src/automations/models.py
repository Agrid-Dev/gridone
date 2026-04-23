from __future__ import annotations

from datetime import datetime  # noqa: TC003
from enum import StrEnum

from pydantic import BaseModel, ConfigDict


class ExecutionStatus(StrEnum):
    SUCCESS = "success"
    FAILED = "failed"


class Trigger(BaseModel):
    """Opaque trigger descriptor stored with an Automation.

    ``type`` identifies the provider (e.g. "schedule", "change_event").
    Extra fields are provider-specific params passed to ``TriggerProvider.register``.
    """

    model_config = ConfigDict(extra="allow")
    type: str


class TriggerContext(BaseModel):
    timestamp: datetime


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
