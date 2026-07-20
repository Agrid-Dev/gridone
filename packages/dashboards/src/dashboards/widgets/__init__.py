from dashboards.widgets.config import WidgetConfig
from dashboards.widgets.registry import (
    WidgetRegistry,
    WidgetSize,
    WidgetType,
    build_default_registry,
)
from dashboards.widgets.text import HEX_COLOR_PATTERN, TextWidgetConfig

__all__ = [
    "HEX_COLOR_PATTERN",
    "TextWidgetConfig",
    "WidgetConfig",
    "WidgetRegistry",
    "WidgetSize",
    "WidgetType",
    "build_default_registry",
]
