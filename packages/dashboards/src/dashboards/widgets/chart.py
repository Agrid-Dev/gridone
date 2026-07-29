from __future__ import annotations

from typing import Literal

from pydantic import Field

from dashboards.widgets.config import WidgetConfig
from models.types import AggregationOperator  # noqa: TC001


class ChartWidgetConfig(WidgetConfig):
    """Time-series chart over one attribute of one device.

    The data source is deliberately the narrowest useful one: a single
    ``(device, attribute)`` pair. Points are read over the dashboard period, so
    nothing about the time window is stored here.

    Both the device set and the number of series widen in later work (a
    filter-shaped target, then several series per chart). Widening either one
    rewrites this shape, so stored configs migrate — an accepted trade for
    keeping the first slice minimal while no real dashboards exist.
    """

    type: Literal["chart"] = "chart"
    # Non-empty so ``minLength`` reaches the generated JSON Schema: the editor
    # seeds string fields with "", which an unconstrained ``str`` accepts — the
    # form would call itself valid and offer to save a chart bound to nothing.
    device_id: str = Field(min_length=1)
    attribute: str = Field(min_length=1)
    agg: AggregationOperator | None = None
    """How readings are reduced over each time bucket; ``None`` plots them raw.

    Whether the operator suits the attribute's data type is the timeseries
    package's rule (``AGG_COMPAT``), enforced when the series is read — an
    ``avg`` of a string is refused there rather than here, so this config never
    has to know which combinations exist.

    The bucket width is not stored: it resolves from the dashboard period, which
    is a viewing concern. A widget-level interval arrives with multi-series
    charts, where the buckets have to align across series.
    """
