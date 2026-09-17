"""Read-only command eligibility using the same validation as actual writes."""

from __future__ import annotations

from typing import TYPE_CHECKING

from pydantic import BaseModel, Field

from devices_manager.types import AttributeValueType  # noqa: TC001 -- pydantic schema
from models.attribute_metadata import LocalizedText
from models.command_confirmation import redact_text
from models.write_rules import (
    AttributeWriteState,
    ResolvedConstraints,
    WriteReason,
)

if TYPE_CHECKING:
    from .device import CoreDevice


class DeviceWritePreview(BaseModel):
    device_id: str
    name: str
    current_value: AttributeValueType | None
    eligible: bool
    value: AttributeValueType | None = None
    constraints: ResolvedConstraints | None = None
    reasons: list[WriteReason] = Field(default_factory=list)
    warnings: list[WriteReason] = Field(default_factory=list)
    write_state: AttributeWriteState | None = None
    revision: int = 0
    user_confirmation: LocalizedText | None = None
    sensitive: bool = False
    current_value_known: bool = False
    attribute_label: LocalizedText | None = None
    unit: str | None = None


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
            reasons=[WriteReason(code="unknown_attribute")],
        )
    evaluation = device.evaluate_attribute_write(attribute_name, value)
    device.project_write_states()
    message = attribute.user_confirmation
    if message is not None and attribute.sensitive:
        message = LocalizedText(
            default=redact_text(message.default, attribute.current_value, value),
            translations={
                language: redact_text(text, attribute.current_value, value)
                for language, text in message.translations.items()
            },
        )
    return DeviceWritePreview(
        device_id=device.id,
        name=device.name,
        current_value=None if attribute.sensitive else attribute.current_value,
        current_value_known=attribute.current_value is not None,
        user_confirmation=message,
        sensitive=attribute.sensitive,
        attribute_label=attribute.label,
        unit=attribute.unit,
        eligible=evaluation.eligible,
        value=evaluation.value,
        constraints=attribute.write_state.constraints
        if attribute.write_state
        else None,
        write_state=attribute.write_state,
        reasons=evaluation.reasons,
        warnings=evaluation.warnings,
        revision=device.write_state_revision,
    )
