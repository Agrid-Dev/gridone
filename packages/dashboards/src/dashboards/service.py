from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from dashboards.interface import DashboardsServiceInterface
from dashboards.models import (
    Dashboard,
    DashboardSummary,
    Metadata,
    Widget,
    WidgetLayout,
)
from dashboards.storage import build_storage
from dashboards.widgets.registry import WidgetRegistry, build_default_registry
from models.errors import InvalidError, NotFoundError
from models.ids import gen_id
from models.pagination import Page
from models.service import Service

if TYPE_CHECKING:
    from collections.abc import Mapping, Sequence

    from dashboards.models import (
        DashboardCreate,
        DashboardPatch,
        LayoutItem,
        WidgetPatch,
    )
    from dashboards.storage.protocol import DashboardsStorage
    from models.pagination import PaginationParams


def _now() -> datetime:
    return datetime.now(UTC)


class DashboardsService(DashboardsServiceInterface, Service):
    """Owns dashboard documents and their widgets.

    Mutations follow a read-modify-write cycle: the service reads the whole
    dashboard, mutates the aggregate in memory (validating widget config
    against the registry first, so an invalid config is rejected before any
    write), then persists the full replacement. All business rules — widget
    placement, type immutability, layout/widget bijection — live here; the
    storage only round-trips whole aggregates.
    """

    _storage: DashboardsStorage

    def __init__(
        self,
        storage_url: str | None,
        registry: WidgetRegistry | None = None,
    ) -> None:
        self._storage_url = storage_url
        self._registry = registry or build_default_registry()

    async def start(self) -> None:
        self._storage = await build_storage(self._storage_url, self._registry)

    async def stop(self) -> None:
        if hasattr(self, "_storage"):
            await self._storage.close()

    # ------------------------------------------------------------------
    # Dashboard CRUD
    # ------------------------------------------------------------------

    async def create(self, params: DashboardCreate) -> Dashboard:
        dashboard = Dashboard(
            id=gen_id(),
            name=params.name,
            description=params.description,
            widgets=[],
            metadata=Metadata(),
        )
        return await self._storage.create(dashboard)

    async def get(self, dashboard_id: str) -> Dashboard:
        dashboard = await self._storage.get(dashboard_id)
        if dashboard is None:
            msg = f"Dashboard {dashboard_id!r} not found"
            raise NotFoundError(msg)
        return dashboard

    async def list(
        self, *, pagination: PaginationParams | None = None
    ) -> Page[DashboardSummary]:
        total = await self._storage.count()
        if pagination is not None:
            items = await self._storage.list_summaries(
                limit=pagination.limit, offset=pagination.offset
            )
            return Page(
                items=items, total=total, page=pagination.page, size=pagination.size
            )
        items = await self._storage.list_summaries()
        return Page(items=items, total=total, page=1, size=max(total, 1))

    async def update(self, dashboard_id: str, patch: DashboardPatch) -> Dashboard:
        dashboard = await self.get(dashboard_id)
        fields = patch.model_fields_set
        if "name" in fields:
            if patch.name is None:
                msg = "Dashboard name cannot be null"
                raise InvalidError(msg)
            dashboard.name = patch.name
        if "description" in fields:
            dashboard.description = patch.description
        dashboard.metadata.updated_at = _now()
        return await self._storage.update(dashboard)

    async def delete(self, dashboard_id: str) -> None:
        await self._storage.delete(dashboard_id)

    # ------------------------------------------------------------------
    # Widgets
    # ------------------------------------------------------------------

    async def add_widget(
        self,
        dashboard_id: str,
        *,
        config: Mapping[str, Any],
        title: str | None = None,
        description: str | None = None,
    ) -> Widget:
        """Add a widget to a dashboard, placed at the bottom of the grid with
        its type's default size. ``config`` carries the ``type`` discriminator
        and is validated against the registry before anything is persisted."""
        dashboard = await self.get(dashboard_id)
        widget_config = self._registry.validate_config(config)
        widget = Widget(
            id=gen_id(),
            title=title,
            description=description,
            config=widget_config,
            layout=self._bottom_placement(dashboard, widget_config.type),
            metadata=Metadata(),
        )
        dashboard.widgets.append(widget)
        dashboard.metadata.updated_at = _now()
        updated = await self._storage.update(dashboard)
        return self._find_widget(updated, widget.id)

    async def update_widget(
        self, dashboard_id: str, widget_id: str, patch: WidgetPatch
    ) -> Widget:
        """Update a widget's ``title`` / ``description`` / ``config``.

        A widget's ``type`` is immutable: a ``config`` whose ``type`` differs
        from the existing widget's is rejected (changing type is remove + add).
        """
        dashboard = await self.get(dashboard_id)
        widget = self._find_widget(dashboard, widget_id)
        fields = patch.model_fields_set
        if "config" in fields and patch.config is not None:
            new_config = self._registry.validate_config(patch.config)
            if new_config.type != widget.config.type:
                msg = (
                    f"Cannot change widget type from {widget.config.type!r} "
                    f"to {new_config.type!r}"
                )
                raise InvalidError(msg)
            widget.config = new_config
        if "title" in fields:
            widget.title = patch.title
        if "description" in fields:
            widget.description = patch.description
        now = _now()
        widget.metadata.updated_at = now
        dashboard.metadata.updated_at = now
        updated = await self._storage.update(dashboard)
        return self._find_widget(updated, widget_id)

    async def remove_widget(self, dashboard_id: str, widget_id: str) -> None:
        """Remove a widget and, with it, its layout item — geometry lives on
        the widget, so no separate layout bookkeeping is needed."""
        dashboard = await self.get(dashboard_id)
        # Confirm existence so a missing id is a NotFound, not a silent no-op.
        self._find_widget(dashboard, widget_id)
        dashboard.widgets = [w for w in dashboard.widgets if w.id != widget_id]
        dashboard.metadata.updated_at = _now()
        await self._storage.update(dashboard)

    async def update_layout(
        self, dashboard_id: str, items: Sequence[LayoutItem]
    ) -> Dashboard:
        """Replace the whole grid layout.

        Requires an exact bijection between ``items`` and the dashboard's
        widgets: every widget gets exactly one item and every item's ``i``
        references an existing widget. Each item's geometry is written back
        onto its widget.
        """
        dashboard = await self.get(dashboard_id)
        self._validate_layout_bijection(dashboard, items)
        by_id = {item.i: item for item in items}
        now = _now()
        for widget in dashboard.widgets:
            item = by_id[widget.id]
            new_layout = WidgetLayout(x=item.x, y=item.y, w=item.w, h=item.h)
            if new_layout != widget.layout:
                widget.layout = new_layout
                widget.metadata.updated_at = now
        dashboard.metadata.updated_at = now
        return await self._storage.update(dashboard)

    # ------------------------------------------------------------------
    # Widget registry
    # ------------------------------------------------------------------

    def widget_schemas(self) -> dict[str, dict[str, Any]]:
        """Return a JSON Schema per registered widget type."""
        return self._registry.schemas()

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _bottom_placement(self, dashboard: Dashboard, widget_type: str) -> WidgetLayout:
        """Geometry for a new widget: full-width-left at the grid's bottom edge,
        sized to the type's default footprint."""
        bottom = max(
            (w.layout.y + w.layout.h for w in dashboard.widgets),
            default=0,
        )
        size = self._registry.default_size(widget_type)
        return WidgetLayout(x=0, y=bottom, w=size.w, h=size.h)

    @staticmethod
    def _find_widget(dashboard: Dashboard, widget_id: str) -> Widget:
        for widget in dashboard.widgets:
            if widget.id == widget_id:
                return widget
        msg = f"Widget {widget_id!r} not found on dashboard {dashboard.id!r}"
        raise NotFoundError(msg)

    @staticmethod
    def _validate_layout_bijection(
        dashboard: Dashboard, items: Sequence[LayoutItem]
    ) -> None:
        item_ids = [item.i for item in items]
        if len(item_ids) != len(set(item_ids)):
            msg = "Layout has duplicate widget ids"
            raise InvalidError(msg)
        widget_ids = {w.id for w in dashboard.widgets}
        if set(item_ids) != widget_ids:
            msg = "Layout must have exactly one item per widget"
            raise InvalidError(msg)
