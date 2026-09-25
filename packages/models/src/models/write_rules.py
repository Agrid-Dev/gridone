"""Driver-authored write rules and their public, resolved results."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, model_validator

from models.attribute_metadata import LocalizedText  # noqa: TC001 -- schema runtime
from models.command_confirmation import (
    WriteConsent,  # noqa: TC001 -- pydantic schema
)
from models.conditions import scalar_key
from models.expressions import MAX_LIST_ITEMS, Condition, Expression, Scalar


class WriteReason(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    code: Annotated[str, Field(pattern=r"^[a-z][a-z0-9_]*$", max_length=64)]
    message: LocalizedText | None = None
    operating_rule_id: str | None = None
    operating_rule_explanation: str | None = None


class WriteRule(BaseModel):
    """Require a condition, or announce a warning when its condition is true."""

    model_config = ConfigDict(extra="forbid")

    condition: Condition
    reason: WriteReason
    effect: Literal["require", "warn"] = "require"


class WriteOption(BaseModel):
    model_config = ConfigDict(extra="forbid")

    value: Scalar
    allowed_when: Condition | None = None
    reason: WriteReason | None = None


class MappingEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: Scalar
    value: Expression
    selectable: bool = True


class ValueMapping(BaseModel):
    """An ordered per-instance table above the ordinary mono-value codecs."""

    model_config = ConfigDict(extra="forbid")

    entries: Annotated[
        list[MappingEntry], Field(min_length=1, max_length=MAX_LIST_ITEMS)
    ]
    duplicates: Literal["reject", "first"] = "reject"
    stop_value: Scalar | None = None

    @model_validator(mode="after")
    def unique_codes(self) -> ValueMapping:
        keys = [scalar_key(entry.code) for entry in self.entries]
        if len(set(keys)) != len(keys):
            msg = "mapping codes must be unique"
            raise ValueError(msg)
        return self


class ResolvedConstraints(BaseModel):
    minimum: float | None = None
    maximum: float | None = None
    step: float | None = None
    unknown: list[str] = Field(default_factory=list)
    sentinels: list[float] = Field(default_factory=list)


class ResolvedOption(BaseModel):
    value: Scalar
    available: bool
    reasons: list[WriteReason] = Field(default_factory=list)


class AttributeWriteState(BaseModel):
    """Server projection; clients never need to fetch or evaluate dependencies."""

    status: Literal["ready", "blocked", "unknown"] = "ready"
    support: Literal["supported", "unsupported", "unknown"] = "supported"
    constraints: ResolvedConstraints | None = None
    options: list[ResolvedOption] | None = None
    reasons: list[WriteReason] = Field(default_factory=list)
    warnings: list[WriteReason] = Field(default_factory=list)
    missing_dependencies: bool = False
    # The API must filter names through the caller's attribute read scope.
    missing_attributes: list[str] = Field(default_factory=list)
    candidate_required: bool = False


class WriteEvaluation(BaseModel):
    eligible: bool
    value: Scalar | None = None
    reasons: list[WriteReason] = Field(default_factory=list)
    warnings: list[WriteReason] = Field(default_factory=list)
    policy_binding: str | None = Field(
        default=None,
        validation_alias=AliasChoices("policy_binding", "operating_rule_binding"),
    )
    unknown_requirement_ids: list[str] = Field(
        default_factory=list,
        validation_alias=AliasChoices(
            "unknown_requirement_ids", "unknown_operating_rule_ids"
        ),
    )
    consent: WriteConsent | None = Field(
        default=None,
        validation_alias=AliasChoices("consent", "operating_rule_confirmation"),
    )

    consent_required: bool = False
