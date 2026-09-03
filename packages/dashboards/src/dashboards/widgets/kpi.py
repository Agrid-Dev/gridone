from __future__ import annotations

from typing import TYPE_CHECKING, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from dashboards.widgets.config import (
    WidgetConfig,
    WidgetSize,
    validate_space_agg_membership,
)
from models.errors import InvalidError
from models.targets import AttributeTarget, DevicesFilter
from models.types import AggregationOperator  # noqa: TC001

if TYPE_CHECKING:
    from models.targets import ResolvedTarget


class TimeAggregation(BaseModel):
    """Reduces the whole dashboard period to one value; no bucket width stored."""

    model_config = ConfigDict(extra="forbid")

    operator: AggregationOperator


class KpiAttribute(BaseModel):
    """One metric shown on a KPI tile: an attribute plus how it folds and
    renders, read against the tile's shared device set (see
    :class:`KpiWidgetConfig`).

    Without ``space_agg`` the device set must resolve to exactly one device
    for this attribute; with it, any number fold into one.
    """

    model_config = ConfigDict(extra="forbid")

    label: str = Field(min_length=1)
    """Names this row on the tile — a multi-attribute tile renders several
    unlabelled numbers otherwise."""
    attribute: str = Field(min_length=1)
    space_agg: AggregationOperator | None = None
    """How the device set folds into one; ``None`` keeps the single-device
    requirement. Membership checked here; dtype compatibility at read time."""
    unit: str | None = None
    precision: int | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def _validate_space_agg(self) -> KpiAttribute:
        if self.space_agg is not None:
            validate_space_agg_membership(self.space_agg)
        return self

    def check_resolved(self, target: ResolvedTarget) -> None:
        """Cardinality rule for this attribute's resolved target.

        Without ``space_agg`` it must resolve to exactly one device; with it,
        any non-empty set is fine — cardinality collapses to one at read time.
        Named by ``label`` so a multi-attribute tile's error is actionable.
        """
        prefix = f"Attribute {self.label!r}: KPI target must resolve to"
        if self.space_agg is None:
            if len(target.device_ids) != 1:
                msg = f"{prefix} exactly one device, got {len(target.device_ids)}"
                raise InvalidError(msg)
        elif not target.device_ids:
            msg = f"{prefix} at least one device"
            raise InvalidError(msg)


class KpiWidgetConfig(WidgetConfig):
    """One or more metrics of one shared device set, shown together on one
    tile.

    Every metric shares the tile's single device set and Live/Period temporal
    mode; each otherwise folds and renders independently (see
    :class:`KpiAttribute`).
    """

    type: Literal["kpi"] = "kpi"
    devices: DevicesFilter
    attributes: list[KpiAttribute] = Field(min_length=1)
    temporal: Literal["live"] | TimeAggregation = "live"

    @model_validator(mode="after")
    def _require_space_agg_for_multi_device_sets(self) -> KpiWidgetConfig:
        """Pins the shared device set's shape: an attribute with no
        ``space_agg`` needs it to already be one explicit id, no types/tags
        filter — otherwise resolution can yield more than one device and
        there is nothing to collapse it to a single reading. With
        ``space_agg`` any non-empty criteria is fine — cardinality collapses
        to one at read time instead."""
        single_id = self.devices.ids is not None and len(self.devices.ids) == 1
        is_single_explicit = (
            single_id and not self.devices.types and not self.devices.tags
        )
        if is_single_explicit:
            return self
        missing = [a.label for a in self.attributes if a.space_agg is None]
        if missing:
            names = ", ".join(repr(label) for label in missing)
            msg = (
                f"Attribute(s) {names} need a fold operator: the device set "
                "can match more than one device"
            )
            raise ValueError(msg)
        return self

    def targets(self) -> list[AttributeTarget]:
        return [
            AttributeTarget(devices=self.devices, attribute=attribute.attribute)
            for attribute in self.attributes
        ]

    def validate_resolved(self, resolved: list[ResolvedTarget]) -> None:
        for attribute, target in zip(self.attributes, resolved, strict=True):
            attribute.check_resolved(target)

    def content_size_hint(self, default_size: WidgetSize) -> WidgetSize:
        """One row of height per attribute."""
        return WidgetSize(w=default_size.w, h=max(default_size.h, len(self.attributes)))
