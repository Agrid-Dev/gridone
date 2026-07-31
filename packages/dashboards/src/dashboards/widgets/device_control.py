from __future__ import annotations

from typing import Literal

from pydantic import Field

from dashboards.widgets.config import WidgetConfig


class DeviceControlWidgetConfig(WidgetConfig):
    """The standard control surface of one device, embedded in a dashboard.

    Live-only by design: the widget mirrors the device page (current values,
    writes), so the config carries just the device to control — no
    mode/operator, and the dashboard period does not apply. It declares no
    ``targets()``: it references a whole device rather than reading attribute
    series, and a missing device is a render-time error state, not a save-time
    gate.
    """

    type: Literal["device_control"] = "device_control"
    device_id: str = Field(min_length=1)
