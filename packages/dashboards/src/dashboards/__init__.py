from dashboards.interface import DashboardsServiceInterface
from dashboards.models import (
    Dashboard,
    DashboardCreate,
    DashboardPatch,
    DashboardSummary,
    LayoutItem,
    Metadata,
    Widget,
    WidgetLayout,
    WidgetPatch,
)
from dashboards.service import DashboardsService
from dashboards.widgets import (
    TextWidgetConfig,
    WidgetConfig,
    WidgetRegistry,
    WidgetSize,
    WidgetType,
    build_default_registry,
)

__all__ = [
    "Dashboard",
    "DashboardCreate",
    "DashboardPatch",
    "DashboardSummary",
    "DashboardsService",
    "DashboardsServiceInterface",
    "LayoutItem",
    "Metadata",
    "TextWidgetConfig",
    "Widget",
    "WidgetConfig",
    "WidgetLayout",
    "WidgetPatch",
    "WidgetRegistry",
    "WidgetSize",
    "WidgetType",
    "build_default_registry",
]
