from __future__ import annotations

from typing import TYPE_CHECKING, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from dashboards.widgets.config import WidgetConfig
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
    """Single number over one attribute of one device."""

    type: Literal["kpi"] = "kpi"
    target: AttributeTarget
    temporal: Literal["live"] | TimeAggregation = "live"
    unit: str | None = None
    precision: int | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def _require_single_explicit_device(self) -> KpiWidgetConfig:
        """Pins the target shape: one explicit id, no types/tags filter."""
        devices = self.target.devices
        single_id = devices.ids is not None and len(devices.ids) == 1
        if not single_id or devices.types or devices.tags:
            msg = "KPI target must be exactly one explicit device id"
            raise ValueError(msg)
        return self

    def targets(self) -> list[AttributeTarget]:
        return [self.target]

    def validate_resolved(self, resolved: list[ResolvedTarget]) -> None:
        [target] = resolved
        if len(target.device_ids) != 1:
            msg = (
                f"KPI target must resolve to exactly one device, "
                f"got {len(target.device_ids)}"
            )
            raise InvalidError(msg)
