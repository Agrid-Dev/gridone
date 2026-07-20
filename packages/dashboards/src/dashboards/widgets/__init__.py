from dashboards.widgets.config import WidgetConfig
from dashboards.widgets.registry import (
    WidgetRegistry,
    WidgetSize,
    WidgetType,
    build_default_registry,
)
from dashboards.widgets.text import TextWidgetConfig

__all__ = [
    "TextWidgetConfig",
    "WidgetConfig",
    "WidgetRegistry",
    "WidgetSize",
    "WidgetType",
    "build_default_registry",
]
