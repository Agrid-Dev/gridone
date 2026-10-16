"""The labels document of a driver: what to call each attribute, for a person.

Labels are declarations of the driver, identical for every device of the
driver, so the API serves them once per driver (ADR 0008) instead of on
every device attribute. The document is cached by clients under the
``driver_revision`` devices carry.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from pydantic import BaseModel, Field

from devices_manager.core.driver.revision import get_driver_revision
from models.attribute_metadata import (  # noqa: TC001 -- pydantic validates at runtime
    AttributeGroup,
    LocalizedText,
    ValueLabels,
)

if TYPE_CHECKING:
    from devices_manager.core.driver import AttributeDriver, Driver


class AttributeLabels(BaseModel):
    """The human-facing side of one attribute. Unset fields are omitted."""

    label: LocalizedText | None = None
    description: LocalizedText | None = None
    group: AttributeGroup | None = None
    value_labels: ValueLabels | None = None

    @property
    def is_empty(self) -> bool:
        return all(getattr(self, name) is None for name in AttributeLabels.model_fields)


class DriverLabels(BaseModel):
    """Labels of a driver's attributes, keyed by attribute name.

    An attribute that declares no label at all is absent from the document.
    """

    revision: str
    attributes: dict[str, AttributeLabels] = Field(default_factory=dict)


def _attribute_labels(attribute: AttributeDriver) -> AttributeLabels:
    return AttributeLabels(
        label=attribute.label,
        description=attribute.description,
        group=attribute.group,
        value_labels=attribute.value_labels,
    )


def driver_labels(driver: Driver) -> DriverLabels:
    """Project the labels every attribute of ``driver`` declares."""
    labels = {
        name: _attribute_labels(attribute)
        for name, attribute in driver.attributes.items()
    }
    return DriverLabels(
        revision=get_driver_revision(driver),
        attributes={
            name: entry for name, entry in labels.items() if not entry.is_empty
        },
    )
