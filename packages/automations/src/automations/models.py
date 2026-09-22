from __future__ import annotations

from datetime import datetime  # noqa: TC003 - pydantic needs this at runtime
from enum import StrEnum
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints, model_validator

from models.action_failure import ActionFailure  # noqa: TC001 -- pydantic schema
from models.expressions import (
    MAX_ATTRIBUTE_OPERATIONS,
    MAX_EXPRESSION_DEPTH,
    MAX_RULES,
    AttributeRef,
    CandidateRef,
    Condition,
    DeviceAttributeRef,
    Scalar,
    expression_nodes,
)
from models.ids import gen_id
from models.metadata import ResourceMetadata
from models.types import AttributeValueType  # noqa: TC001 -- pydantic schema

NonBlank = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class ExecutionStatus(StrEnum):
    SUCCESS = "success"
    FAILED = "failed"
    NO_MATCH = "no_match"
    INITIALIZED = "initialized"
    SUSPENDED = "suspended"


class Trigger(BaseModel):
    provider_id: str
    params: dict = Field(default_factory=dict)


class Action(BaseModel):
    provider_id: str
    params: dict = Field(default_factory=dict)


class AutomationWrite(DeviceAttributeRef):
    value: Scalar | None = None


class AutomationDiagnostic(BaseModel):
    code: Literal["potential_write_conflict", "direct_feedback"]
    target: DeviceAttributeRef
    other_automation_id: str | None = None


class TriggerContext(BaseModel):
    timestamp: datetime
    device_id: str | None = None
    attribute: str | None = None
    previous_value: AttributeValueType | None = None
    value: AttributeValueType | None = None
    has_previous: bool = False
    is_initial: bool = False

    def event_value(self, name: str) -> AttributeValueType | None:
        return getattr(self, name, None)


class AutomationBranch(BaseModel):
    id: NonBlank = Field(default_factory=gen_id)
    name: str = ""
    condition: Condition | None = None
    action: Action

    @model_validator(mode="after")
    def bounded_condition(self) -> AutomationBranch:
        """Bound each branch and require explicit points or event references."""
        for count, (_, node, depth) in enumerate(expression_nodes(self.condition), 1):
            if depth > MAX_EXPRESSION_DEPTH or count > MAX_ATTRIBUTE_OPERATIONS:
                msg = "automation_expression_limit"
                raise ValueError(msg)
            if isinstance(node, AttributeRef | CandidateRef):
                msg = "automation_requires_device_or_event_reference"
                raise ValueError(msg)  # noqa: TRY004 -- pydantic validation error
        return self


class AutomationSuspension(BaseModel):
    reason: NonBlank
    actor_id: NonBlank
    suspended_at: datetime
    source: Literal["operator", "circuit_breaker"] = "operator"


class SuspensionRequest(BaseModel):
    reason: NonBlank


class AutomationGuardrails(BaseModel):
    max_executions: int = Field(default=10, ge=1, le=1000)
    window_seconds: float = Field(default=60, gt=0, le=86400, allow_inf_nan=False)
    max_consecutive_failures: int = Field(default=3, ge=1, le=100)


class AutomationCreate(BaseModel):
    name: str
    description: str = ""
    trigger: Trigger
    action: Action | None = Field(default=None, json_schema_extra={"deprecated": True})
    branches: list[AutomationBranch] = Field(default_factory=list, max_length=MAX_RULES)
    enabled: bool = True
    guardrails: AutomationGuardrails = Field(default_factory=AutomationGuardrails)
    max_age_seconds: float | None = Field(default=None, gt=0, allow_inf_nan=False)

    @model_validator(mode="after")
    def normalize_branches(self) -> AutomationCreate:
        """Legacy actions become one unconditional branch at the input boundary."""
        if not self.branches:
            if self.action is None or "branches" in self.model_fields_set:
                msg = "automation_requires_branches"
                raise ValueError(msg)
            self.branches = [AutomationBranch(action=self.action)]
        if self.action is not None and self.action != self.branches[0].action:
            msg = "automation_action_conflicts_with_branches"
            raise ValueError(msg)
        if len({branch.id for branch in self.branches}) != len(self.branches):
            msg = "automation_duplicate_branch_id"
            raise ValueError(msg)
        self.action = self.branches[0].action
        return self


class AutomationUpdate(BaseModel):
    name: str | None = None
    description: str = ""
    trigger: Trigger | None = None
    action: Action | None = None
    enabled: bool | None = None
    branches: list[AutomationBranch] | None = Field(
        default=None, min_length=1, max_length=MAX_RULES
    )
    guardrails: AutomationGuardrails | None = None
    max_age_seconds: float | None = Field(default=None, gt=0, allow_inf_nan=False)


class Automation(AutomationCreate, ResourceMetadata):
    action: Action
    id: str = ""
    created_by: str = ""
    suspension: AutomationSuspension | None = None

    def apply_update(self, params: AutomationUpdate) -> Automation:
        if not params.model_fields_set:
            return self
        changes = {k: getattr(params, k) for k in params.model_fields_set}
        if "branches" in changes and params.branches:
            changes["action"] = params.branches[0].action
        elif params.action is not None:
            if len(self.branches) != 1:
                msg = "legacy_action_update_requires_single_branch"
                raise ValueError(msg)
            changes["branches"] = [
                self.branches[0].model_copy(update={"action": params.action})
            ]
        updated = self.touch_updated_at(**changes)
        return Automation.model_validate(updated.model_dump())


class BranchEvaluation(BaseModel):
    branch_id: str
    result: Literal["matched", "not_matched", "unknown"]
    missing: list[str] = Field(default_factory=list)


class AutomationExecution(BaseModel):
    id: str
    automation_id: str
    triggered_at: datetime
    executed_at: datetime | None = None
    status: ExecutionStatus
    error: str | None = None
    output_id: str | None = None
    error_details: ActionFailure | None = None
    context: TriggerContext | None = None
    branch_id: str | None = None
    branches: list[BranchEvaluation] = Field(default_factory=list)
    reason: str | None = None
