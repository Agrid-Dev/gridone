from __future__ import annotations

from typing import TYPE_CHECKING, Any, Protocol

if TYPE_CHECKING:
    from collections.abc import Mapping, Sequence

    from dashboards.models import (
        Dashboard,
        DashboardCreate,
        DashboardPatch,
        DashboardSummary,
        LayoutItem,
        Widget,
        WidgetPatch,
    )
    from models.pagination import Page, PaginationParams


class DashboardsServiceInterface(Protocol):
    """Public contract of the dashboards service.

    Covers dashboard CRUD, widget mutation, layout replacement, and exposing
    the widget config JSON Schemas. Widget ``config`` is validated against the
    registry; the backend is the single source of truth for widget schemas.
    """

    # -- dashboard CRUD --

    async def create(self, params: DashboardCreate) -> Dashboard: ...

    async def get(self, dashboard_id: str) -> Dashboard: ...

    async def list(
        self, *, pagination: PaginationParams | None = None
    ) -> Page[DashboardSummary]: ...

    async def update(self, dashboard_id: str, patch: DashboardPatch) -> Dashboard: ...

    async def delete(self, dashboard_id: str) -> None: ...

    # -- widgets --

    async def add_widget(
        self,
        dashboard_id: str,
        *,
        config: Mapping[str, Any],
        title: str | None = None,
        description: str | None = None,
    ) -> Widget: ...

    async def update_widget(
        self, dashboard_id: str, widget_id: str, patch: WidgetPatch
    ) -> Widget: ...

    async def remove_widget(self, dashboard_id: str, widget_id: str) -> None: ...

    async def update_layout(
        self, dashboard_id: str, items: Sequence[LayoutItem]
    ) -> Dashboard: ...

    # -- widget registry --

    def widget_schemas(self) -> dict[str, dict[str, Any]]: ...
