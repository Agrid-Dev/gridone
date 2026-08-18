from dashboards.widgets.chart import ChartWidgetConfig
from dashboards.widgets.config import WidgetConfig
from dashboards.widgets.device_control import DeviceControlWidgetConfig
from dashboards.widgets.kpi import KpiWidgetConfig, TimeAggregation
from dashboards.widgets.registry import (
    WidgetRegistry,
    WidgetSize,
    WidgetType,
    build_default_registry,
)
from dashboards.widgets.text import TextWidgetConfig

__all__ = [
    "ChartWidgetConfig",
    "DeviceControlWidgetConfig",
    "KpiWidgetConfig",
    "TextWidgetConfig",
    "TimeAggregation",
    "WidgetConfig",
    "WidgetRegistry",
    "WidgetSize",
    "WidgetType",
    "build_default_registry",
]
