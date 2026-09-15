"""Read-only command eligibility using the same validation as actual writes."""

from __future__ import annotations

from typing import TYPE_CHECKING, Literal

from pydantic import BaseModel

from devices_manager.types import AttributeValueType  # noqa: TC001 -- pydantic schema
from models.errors import InvalidError, NotFoundError

from .device.write_constraints import WriteConstraintPreview, preview_write_constraints
from .presentation.group_conditions import group_write_blocked

if TYPE_CHECKING:
    from .device import CoreDevice


class DeviceWritePreview(BaseModel):
    device_id: str
    name: str
    current_value: AttributeValueType | None
    eligible: bool
    constraints: WriteConstraintPreview | None = None
    reason: (
        Literal[
            "not_writable",
            "invalid_value",
            "constraints",
            "unknown_attribute",
            "control_blocked",
        ]
        | None
    ) = None


def preview_write(
    device: CoreDevice, attribute_name: str, value: AttributeValueType
) -> DeviceWritePreview:
    """Convert expected validation failures into stable, localizable reasons."""
    attribute = device.attributes.get(attribute_name)

    def known_value(name: str) -> AttributeValueType | None:
        sibling = device.attributes.get(name)
        return sibling.current_value if sibling else None

    result = DeviceWritePreview(
        device_id=device.id,
        name=device.name,
        current_value=attribute.current_value if attribute else None,
        eligible=False,
        constraints=preview_write_constraints(attribute, known_value)
        if attribute
        else None,
    )
    try:
        device.validate_attribute_write(attribute_name, value)
    except PermissionError:
        result.reason = "not_writable"
    except NotFoundError:
        result.reason = "unknown_attribute"
    except InvalidError:
        result.reason = "constraints"
    except (TypeError, ValueError):
        result.reason = "invalid_value"
    else:
        if group_write_blocked(device.driver.presentation, attribute_name, known_value):
            result.reason = "control_blocked"
        else:
            result.eligible = True
    return result
