from __future__ import annotations

from typing import Any, Literal

from pydantic import model_validator

from dashboards.widgets.config import WidgetConfig
from models.targets import AttributeTarget  # noqa: TC001
from models.types import SPACE_AGGREGATION_OPERATORS, AggregationOperator


class ChartWidgetConfig(WidgetConfig):
    """Time-series chart over one attribute of a device set.

    ``target`` follows the shared target model: a persisted device set
    (explicit ids or criteria, resolved at render time) paired with a single
    attribute. Every matched device that exposes the attribute becomes a
    series; the attribute's data type must be the same across the set —
    enforced at save time by the API layer, and surfaced as a render-time
    error state when a dynamic set drifts afterwards.

    Points are read over the dashboard period, so nothing about the time
    window is stored here.
    """

    type: Literal["chart"] = "chart"
    target: AttributeTarget
    agg: AggregationOperator | None = None
    """How readings are reduced over each time bucket; ``None`` plots them raw.

    Whether the operator suits the attribute's data type is the timeseries
    package's rule (``AGG_COMPAT``), enforced when the series is read — an
    ``avg`` of a string is refused there rather than here, so this config never
    has to know which combinations exist.

    The bucket width is not stored: it resolves from the dashboard period, which
    is a viewing concern.
    """

    space_agg: AggregationOperator | None = None
    """How each bucket's values are folded across the device set; ``None``
    plots one series per device.

    Whether the operator suits the attribute's data type stays the timeseries
    package's rule, like ``agg``. Membership in the space vocabulary, though,
    is shared knowledge (``SPACE_AGGREGATION_OPERATORS``), so an operator that
    can never fold a device set is refused at save time.
    """

    group_by: str | None = None
    """Tag key to bucket the device set by before folding; ``None`` folds the
    whole set into one series, same as a bare ``space_agg``.

    Requires ``space_agg``: grouping still needs an operator to fold each
    group's devices.
    """

    @model_validator(mode="after")
    def _validate_space_agg(self) -> ChartWidgetConfig:
        if self.space_agg is None:
            if self.group_by is not None:
                msg = "group_by requires space_agg: it folds each group's devices"
                raise ValueError(msg)
            return self
        if self.agg is None:
            msg = "space_agg requires agg: raw series cannot be space-aggregated"
            raise ValueError(msg)
        if self.space_agg not in SPACE_AGGREGATION_OPERATORS:
            msg = f"Operator '{self.space_agg}' is not a space aggregation operator"
            raise ValueError(msg)
        return self

    @model_validator(mode="before")
    @classmethod
    def _upgrade_legacy_shape(cls, data: Any) -> Any:  # noqa: ANN401
        """Upgrade the pre-target stored shape ``{device_id, attribute}``.

        Configs are re-validated on read, so charts persisted before the
        target model must keep loading without a data migration. The single
        device becomes an explicit-ids target; new saves always persist the
        ``target`` form.
        """
        if isinstance(data, dict) and data.get("device_id") and "target" not in data:
            data = dict(data)
            device_id = data.pop("device_id")
            attribute = data.pop("attribute", None)
            data["target"] = {"devices": {"ids": [device_id]}, "attribute": attribute}
        return data

    def targets(self) -> list[AttributeTarget]:
        return [self.target]
