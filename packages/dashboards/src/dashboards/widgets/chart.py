from __future__ import annotations

from typing import Literal

from pydantic import Field

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
    # Non-empty so ``minLength`` reaches the generated JSON Schema: the editor
    # seeds string fields with "", which an unconstrained ``str`` accepts — the
    # form would call itself valid and offer to save a chart bound to nothing.
    device_id: str = Field(min_length=1)
    attribute: str = Field(min_length=1)
