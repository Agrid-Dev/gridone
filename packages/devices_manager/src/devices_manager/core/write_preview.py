"""Read-only command eligibility using the same validation as actual writes."""

from __future__ import annotations

from typing import TYPE_CHECKING

from pydantic import BaseModel, Field

from devices_manager.types import AttributeValueType  # noqa: TC001 -- pydantic schema
from models.command_rules import AttributeWriteState, WriteReason

from .device.write_constraints import (
    WriteConstraintPreview,  # noqa: TC001 -- schema runtime
)

if TYPE_CHECKING:
    from .device import CoreDevice


class DeviceWritePreview(BaseModel):
    device_id: str
    name: str
    current_value: AttributeValueType | None
    eligible: bool
    value: AttributeValueType | None = None
    constraints: WriteConstraintPreview | None = None
    reason: str | None = None
    reasons: list[WriteReason] = Field(default_factory=list)
    warnings: list[WriteReason] = Field(default_factory=list)
    write_state: AttributeWriteState | None = None
    revision: int = 0


def preview_write(
    device: CoreDevice, attribute_name: str, value: AttributeValueType
) -> DeviceWritePreview:
    """Convert expected validation failures into stable, localizable reasons."""
    attribute = device.attributes.get(attribute_name)

    if attribute is None:
        return DeviceWritePreview(
            device_id=device.id,
            name=device.name,
            current_value=None,
            eligible=False,
            reason="unknown_attribute",
            reasons=[WriteReason(code="unknown_attribute")],
        )
    evaluation = device.evaluate_attribute_write(attribute_name, value)
    return DeviceWritePreview(
        device_id=device.id,
        name=device.name,
        current_value=attribute.current_value,
        eligible=evaluation.eligible,
        value=evaluation.value,
        constraints=attribute.write_state.constraints
        if attribute.write_state
        else None,
        write_state=attribute.write_state,
        reason=evaluation.reasons[0].code if evaluation.reasons else None,
        reasons=evaluation.reasons,
        warnings=evaluation.warnings,
        revision=device.write_state_revision,
    )
