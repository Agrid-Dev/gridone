from __future__ import annotations

from typing import TYPE_CHECKING, Any, Literal

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


class KpiAttribute(BaseModel):
    """One metric shown on a KPI tile: a target plus how it folds and renders.

    Without ``space_agg`` the target must resolve to exactly one device;
    with it, any number fold into one.
    """

    model_config = ConfigDict(extra="forbid")

    target: AttributeTarget
    space_agg: AggregationOperator | None = None
    """How the device set folds into one; ``None`` keeps the single-device
    requirement. Membership checked here; dtype compatibility at read time."""
    unit: str | None = None
    precision: int | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def _require_single_explicit_device(self) -> KpiAttribute:
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
    def _validate_space_agg(self) -> KpiAttribute:
        if self.space_agg is not None:
            validate_space_agg_membership(self.space_agg)
        return self

    def check_resolved(self, target: ResolvedTarget) -> None:
        """Cardinality rule for this attribute's resolved target.

        Without ``space_agg`` it must resolve to exactly one device; with it,
        any non-empty set is fine — cardinality collapses to one at read time.
        """
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


class KpiWidgetConfig(WidgetConfig):
    """One or more metrics of a device set, shown together on one tile.

    Every metric shares the tile's single Live/Period temporal mode; each
    otherwise folds and renders independently (see :class:`KpiAttribute`).
    """

    type: Literal["kpi"] = "kpi"
    attributes: list[KpiAttribute] = Field(min_length=1)
    temporal: Literal["live"] | TimeAggregation = "live"

    @model_validator(mode="before")
    @classmethod
    def _upgrade_legacy_shape(cls, data: Any) -> Any:  # noqa: ANN401
        """Upgrade the pre-multi-attribute stored shape.

        Configs are re-validated on read, so KPIs persisted before this
        change must keep loading without a data migration. The single
        ``target``/``space_agg``/``unit``/``precision`` become a one-entry
        ``attributes`` list; new saves always persist the ``attributes`` form.
        """
        if isinstance(data, dict) and "target" in data and "attributes" not in data:
            data = dict(data)
            data["attributes"] = [
                {
                    "target": data.pop("target"),
                    "space_agg": data.pop("space_agg", None),
                    "unit": data.pop("unit", None),
                    "precision": data.pop("precision", None),
                }
            ]
        return data

    def targets(self) -> list[AttributeTarget]:
        return [attribute.target for attribute in self.attributes]

    def validate_resolved(self, resolved: list[ResolvedTarget]) -> None:
        for attribute, target in zip(self.attributes, resolved, strict=True):
            attribute.check_resolved(target)
