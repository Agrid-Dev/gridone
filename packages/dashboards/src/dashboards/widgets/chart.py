from __future__ import annotations

from typing import Any, Literal

from pydantic import model_validator

from dashboards.widgets.config import WidgetConfig
from models.targets import AttributeTarget  # noqa: TC001
from models.types import AggregationOperator  # noqa: TC001


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
