from __future__ import annotations

from typing import Literal

from dashboards.widgets.config import WidgetConfig


class ChartWidgetConfig(WidgetConfig):
    """Time-series chart over one attribute of one device, plotted raw.

    The data source is deliberately the narrowest useful one: a single
    ``(device, attribute)`` pair, no aggregation. Points are read over the
    dashboard period, so nothing about the time window is stored here.

    Both the device set and the number of series widen in later work (a
    filter-shaped target, then several series per chart). Widening either one
    rewrites this shape, so stored configs migrate — an accepted trade for
    keeping the first slice minimal while no real dashboards exist.
    """

    type: Literal["chart"] = "chart"
    device_id: str
    attribute: str
