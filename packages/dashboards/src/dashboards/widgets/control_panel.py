from __future__ import annotations

from typing import TYPE_CHECKING, Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictBool

from dashboards.widgets.config import WidgetConfig
from models.errors import InvalidError
from models.targets import AttributeTarget, DevicesFilter
from models.types import DataType

if TYPE_CHECKING:
    from collections.abc import Iterator

    from models.targets import ResolvedTarget

MAX_SECTIONS = 20
"""Most sections a panel may declare."""

MAX_ATTRIBUTES_PER_SECTION = 50
"""Most attributes one section may list.

Together with :data:`MAX_SECTIONS` this bounds what a hand-written payload can
ask the API to resolve at save time and the view to render; a real panel is a
handful of sections of a few rows each.
"""

_Label = Annotated[str, Field(min_length=1)]

LabelBy = Literal["attribute", "device"]
"""What names a row that declares no label of its own.

A panel is as often many attributes of one device (an automaton's points) as
one attribute across many devices (every leak detector): the first reads by
attribute name, the second by device name.
"""


class AttributeReference(BaseModel):
    """One attribute of one device, by explicit id.

    A panel row is a single physical point, so the pair is spelled flat rather
    than as an :class:`~models.targets.AttributeTarget`: a criteria-based
    device set has nothing to mean here, and a shape that cannot express one
    needs no validator to refuse it. :meth:`as_target` bridges to the shared
    target model for save-time resolution.
    """

    model_config = ConfigDict(extra="forbid")

    device_id: str = Field(min_length=1)
    attribute: str = Field(min_length=1)

    def as_target(self) -> AttributeTarget:
        return AttributeTarget(
            devices=DevicesFilter(ids=[self.device_id]), attribute=self.attribute
        )


class ControlPanelAttribute(AttributeReference):
    """One row of a section: a boolean attribute, shown with its current value.

    How the row is drawn is not stored: whether it is a fault, a command or a
    plain state is the attribute's own contract, read at render time.
    """

    label: _Label | None = None
    """Overrides the name the row is shown under; ``None`` borrows the
    attribute's own label or the device's name, per the panel's ``label_by``."""


class ActiveCondition(AttributeReference):
    """Makes a section active only while an attribute reports ``value``.

    The attribute is freely picked — typically on another device than the
    section's rows (a selector switch enabling one of two pump groups).
    """

    value: StrictBool = True
    """The reading under which the section is active."""

    inactive_reason: _Label | None = None
    """Shown to the operator on a disabled control, to say why it is."""


class ControlPanelSection(BaseModel):
    """A titled group of rows, optionally gated by an :class:`ActiveCondition`."""

    model_config = ConfigDict(extra="forbid")

    title: _Label | None = None
    active_when: ActiveCondition | None = None
    """``None`` keeps the section always active."""

    attributes: list[ControlPanelAttribute] = Field(
        min_length=1, max_length=MAX_ATTRIBUTES_PER_SECTION
    )


class ControlPanelWidgetConfig(WidgetConfig):
    """Boolean attributes picked across devices, grouped into sections.

    Live-only, like ``device_control``: rows show current values, so the
    dashboard period does not apply and nothing about time is stored.

    Booleans only for now. The data type is checked against the resolved
    attributes at save time rather than declared here, so widening to other
    types later is additive.

    A section's ``active_when`` is a display rule of this widget, not a
    safeguard: it disables the section's controls in the view and nothing
    else. A write refused whatever surface it comes from is an operating
    rule's job.
    """

    type: Literal["control_panel"] = "control_panel"
    label_by: LabelBy = "attribute"
    sections: list[ControlPanelSection] = Field(min_length=1, max_length=MAX_SECTIONS)

    def _references(self) -> Iterator[tuple[str, AttributeReference]]:
        """Yield every attribute the panel reads, with a name for error messages.

        The order is the contract between :meth:`targets` and
        :meth:`validate_resolved`: the API resolves the targets and hands them
        back in the same sequence.
        """
        for index, section in enumerate(self.sections, start=1):
            name = f"Section {section.title!r}" if section.title else f"Section {index}"
            if section.active_when is not None:
                yield f"{name} condition", section.active_when
            for attribute in section.attributes:
                row = attribute.label or attribute.attribute
                yield f"{name} attribute {row!r}", attribute

    def targets(self) -> list[AttributeTarget]:
        return [reference.as_target() for _, reference in self._references()]

    def validate_resolved(self, resolved: list[ResolvedTarget]) -> None:
        """Every row and condition must be a boolean attribute."""
        for (name, _), target in zip(self._references(), resolved, strict=True):
            if target.data_type is not DataType.BOOL:
                msg = f"{name} must be a boolean, got {target.data_type.value}"
                raise InvalidError(msg)
