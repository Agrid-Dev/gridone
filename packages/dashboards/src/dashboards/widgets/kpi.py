from __future__ import annotations

from typing import TYPE_CHECKING, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from dashboards.widgets.config import WidgetConfig, validate_space_agg_membership
from models.errors import InvalidError
from models.targets import AttributeTarget  # noqa: TC001
from models.types import AggregationOperator  # noqa: TC001

if TYPE_CHECKING:
    from models.targets import ResolvedTarget


class TimeAggregation(BaseModel):
    """Reduces the whole dashboard period to one value; no bucket width stored."""

    model_config = ConfigDict(extra="forbid")

    operator: AggregationOperator


class KpiWidgetConfig(WidgetConfig):
    """Single number over one attribute of a device set.

    Without ``space_agg`` the target must resolve to exactly one device;
    with it, any number fold into one.
    """

    type: Literal["kpi"] = "kpi"
    target: AttributeTarget
    temporal: Literal["live"] | TimeAggregation = "live"
    space_agg: AggregationOperator | None = None
    """How the device set folds into one; ``None`` keeps the single-device
    requirement. Membership checked here; dtype compatibility at read time."""
    unit: str | None = None
    precision: int | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def _require_single_explicit_device(self) -> KpiWidgetConfig:
        """Pins the target shape without space_agg: one explicit id, no
        types/tags filter. With space_agg, any non-empty criteria is fine —
        cardinality collapses to one at read time instead."""
        if self.space_agg is not None:
            return self
        devices = self.target.devices
        single_id = devices.ids is not None and len(devices.ids) == 1
        if not single_id or devices.types or devices.tags:
            msg = "KPI target must be exactly one explicit device id"
            raise ValueError(msg)
        return self

    @model_validator(mode="after")
    def _validate_space_agg(self) -> KpiWidgetConfig:
        if self.space_agg is not None:
            validate_space_agg_membership(self.space_agg)
        return self

    def targets(self) -> list[AttributeTarget]:
        return [self.target]

    def validate_resolved(self, resolved: list[ResolvedTarget]) -> None:
        [target] = resolved
        if self.space_agg is None:
            if len(target.device_ids) != 1:
                msg = (
                    f"KPI target must resolve to exactly one device, "
                    f"got {len(target.device_ids)}"
                )
                raise InvalidError(msg)
        elif not target.device_ids:
            msg = "KPI target must resolve to at least one device"
            raise InvalidError(msg)
