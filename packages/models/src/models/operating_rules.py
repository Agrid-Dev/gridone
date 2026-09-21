"""Site operating rule contracts, independent of their owner and point source."""

from __future__ import annotations

from datetime import datetime  # noqa: TC003 -- pydantic schema
from typing import Annotated, Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from models.expressions import (
    MAX_ATTRIBUTE_OPERATIONS,
    MAX_EXPRESSION_DEPTH,
    AttributeRef,
    Condition,
    DevicePointRef,
    Scalar,
    expression_nodes,
)
from models.types import AttributeValueType, DataType  # noqa: TC001 -- pydantic schema
from models.write_rules import WriteReason  # noqa: TC001 -- pydantic schema

NonBlank = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class OperatingRuleTarget(DevicePointRef):
    value: Scalar


class OperatingRuleDefinition(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: NonBlank
    target: OperatingRuleTarget
    condition: Condition
    explanation: NonBlank
    max_age_seconds: float | None = Field(
        default=None,
        gt=0,
        allow_inf_nan=False,
        description=(
            "Maximum age of each observed condition point in seconds. "
            "Null disables freshness checks; never-observed or invalidated values "
            "remain unknown."
        ),
    )

    @model_validator(mode="after")
    def bounded_condition(self) -> OperatingRuleDefinition:
        """Keep site rules within the existing language and evaluation budgets."""
        for count, (_, node, depth) in enumerate(expression_nodes(self.condition), 1):
            if depth > MAX_EXPRESSION_DEPTH or count > MAX_ATTRIBUTE_OPERATIONS:
                msg = "operating_rule_expression_limit"
                raise ValueError(msg)
            if isinstance(node, AttributeRef):
                msg = "operating_rule_requires_explicit_device_point"
                raise ValueError(msg)  # noqa: TRY004 -- pydantic validation error
        return self


class PointDefinition(BaseModel):
    data_type: DataType
    writable: bool
    max_age_seconds: float | None


class PointObservation(BaseModel):
    value: AttributeValueType | None = None
    validity: Literal["known", "unknown", "invalid"]


class PointContract(DevicePointRef):
    data_type: DataType


class OperatingRuleRetirement(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    reason: NonBlank
    actor_id: NonBlank
    retired_at: datetime


class OperatingRule(OperatingRuleDefinition):
    enabled: bool = True
    deleted_at: datetime | None = None
    id: str
    revision: int = 1
    created_at: datetime
    created_by: NonBlank
    updated_at: datetime
    updated_by: NonBlank
    points: list[PointContract]
    retirement: OperatingRuleRetirement | None = None


class OperatingRuleView(BaseModel):
    operating_rule: OperatingRule
    reasons: list[WriteReason] = Field(default_factory=list)


class OperatingRuleProvider(Protocol):
    def for_target(self, device_id: str, attribute: str) -> list[OperatingRule]: ...


class PointInspector(Protocol):
    def __call__(self, point: DevicePointRef) -> PointDefinition | None: ...


class PointResolver(Protocol):
    def __call__(
        self, point: DevicePointRef, *, max_age_seconds: float | None = None
    ) -> PointObservation: ...


def operating_rule_points(definition: OperatingRuleDefinition) -> list[DevicePointRef]:
    """Unique dependencies in stable order, separate from the targeted write."""
    return sorted(
        {
            node
            for _, node, _ in expression_nodes(definition.condition)
            if isinstance(node, DevicePointRef)
        },
        key=lambda point: (point.device_id, point.attribute),
    )
