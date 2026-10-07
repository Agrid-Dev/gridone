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
from dashboards.structure import (
    DashboardStructure,
    DashboardStructureUpdate,
    dashboard_ids,
    hydrate,
    reconcile,
)
from dashboards.widgets.config import InvalidWidgetConfig, WidgetSize
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
    from dashboards.widgets.config import WidgetConfig
    from models.pagination import PaginationParams


def _now() -> datetime:
    return datetime.now(UTC)


class DashboardsService(DashboardsServiceInterface, Service):
    """Owns dashboard documents and their widgets.

    Mutations follow a read-modify-write cycle: the service reads the whole
    dashboard, mutates the aggregate in memory (validating widget config
    against the registry first, so an invalid config is rejected before any
    write), then persists the full replacement. All business rules — widget
    placement, type immutability, dashboard/widget type fit, layout/widget
    bijection — live here; the storage only round-trips whole aggregates.

    Reads never fail on one bad widget: a stored config the registry rejects
    comes back as :class:`InvalidWidgetConfig`, and a widget whose type no
    longer fits the dashboard's is kept as is. Both are flagged on the
    widget's ``error`` so the UI renders that cell in an error state while
    the rest of the dashboard works.
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
            type=params.type,
            description=params.description,
            icon=params.icon,
            widgets=[],
            metadata=Metadata(),
        )
        return await self._storage.create(dashboard)

    async def get(self, dashboard_id: str) -> Dashboard:
        dashboard = await self._storage.get(dashboard_id)
        if dashboard is None:
            msg = f"Dashboard {dashboard_id!r} not found"
            raise NotFoundError(msg)
        return self._flag_widget_errors(dashboard)

    async def list(
        self, *, pagination: PaginationParams | None = None
    ) -> Page[DashboardSummary]:
        """Summaries in display order — the structure's depth-first order."""
        document, summaries = await self._reconciled_structure()
        items = [summaries[i] for i in dashboard_ids(document)]
        total = len(items)
        if pagination is not None:
            page = items[pagination.offset : pagination.offset + pagination.limit]
            return Page(
                items=page, total=total, page=pagination.page, size=pagination.size
            )
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
        if "icon" in fields:
            dashboard.icon = patch.icon
        dashboard.metadata.updated_at = _now()
        return await self._persist(dashboard)

    async def delete(self, dashboard_id: str) -> None:
        await self._storage.delete(dashboard_id)

    # ------------------------------------------------------------------
    # Structure
    # ------------------------------------------------------------------

    async def get_structure(self) -> DashboardStructure:
        document, summaries = await self._reconciled_structure()
        return hydrate(document, summaries)

    async def update_structure(
        self, update: DashboardStructureUpdate
    ) -> DashboardStructure:
        """Replace the whole arrangement.

        Requires an exact bijection: every dashboard placed exactly once,
        nothing unknown placed. The nesting rules are the shape of the
        update itself. Sections and groups without an id get one here.
        """
        summaries = await self._summaries_by_id()
        self._validate_structure_bijection(update, set(summaries))
        document = reconcile(update, summaries, new_id=gen_id)
        await self._storage.update_structure(document)
        return hydrate(document, summaries)

    async def _reconciled_structure(
        self,
    ) -> tuple[DashboardStructureUpdate, dict[str, DashboardSummary]]:
        """The stored document brought in line with the dashboards that
        exist: created ones appended at the root, deleted ones dropped. Done
        on read, so creating or deleting a dashboard never touches the
        document."""
        summaries = await self._summaries_by_id()
        stored = await self._storage.get_structure()
        return reconcile(stored, summaries, new_id=gen_id), summaries

    async def _summaries_by_id(self) -> dict[str, DashboardSummary]:
        return {s.id: s for s in await self._storage.list_summaries()}

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
        and is validated against the registry — shape and dashboard fit —
        before anything is persisted."""
        dashboard = await self.get(dashboard_id)
        widget_config = self._registry.validate_config(config)
        self._ensure_fits(dashboard, widget_config)
        widget = Widget(
            id=gen_id(),
            title=title,
            description=description,
            config=widget_config,
            layout=self._bottom_placement(dashboard, widget_config),
            metadata=Metadata(),
        )
        dashboard.widgets.append(widget)
        dashboard.metadata.updated_at = _now()
        updated = await self._persist(dashboard)
        return self._find_widget(updated, widget.id)

    async def update_widget(
        self, dashboard_id: str, widget_id: str, patch: WidgetPatch
    ) -> Widget:
        """Update a widget's ``title`` / ``description`` / ``config``.

        A widget's ``type`` is immutable: a ``config`` whose ``type`` differs
        from the existing widget's is rejected (changing type is remove + add).
        A widget that no longer fits its dashboard's type cannot be
        reconfigured either — the way out is remove + add on a fitting
        dashboard, not an edit that would persist the mismatch anew.
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
            self._ensure_fits(dashboard, new_config)
            widget.config = new_config
            widget.layout = self._grown_layout(widget.layout, new_config)
        if "title" in fields:
            widget.title = patch.title
        if "description" in fields:
            widget.description = patch.description
        now = _now()
        widget.metadata.updated_at = now
        dashboard.metadata.updated_at = now
        updated = await self._persist(dashboard)
        return self._find_widget(updated, widget_id)

    async def remove_widget(self, dashboard_id: str, widget_id: str) -> None:
        """Remove a widget and, with it, its layout item — geometry lives on
        the widget, so no separate layout bookkeeping is needed."""
        dashboard = await self.get(dashboard_id)
        # Confirm existence so a missing id is a NotFound, not a silent no-op.
        self._find_widget(dashboard, widget_id)
        dashboard.widgets = [w for w in dashboard.widgets if w.id != widget_id]
        dashboard.metadata.updated_at = _now()
        await self._persist(dashboard)

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
        return await self._persist(dashboard)

    # ------------------------------------------------------------------
    # Widget registry
    # ------------------------------------------------------------------

    def widget_schemas(self) -> dict[str, dict[str, Any]]:
        """Return a JSON Schema per registered widget type."""
        return self._registry.schemas()

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    async def _persist(self, dashboard: Dashboard) -> Dashboard:
        """Write the whole aggregate back and return it as a read would —
        widget error flags recomputed, so no stale flag survives a write."""
        return self._flag_widget_errors(await self._storage.update(dashboard))

    def _flag_widget_errors(self, dashboard: Dashboard) -> Dashboard:
        """Set each widget's ``error`` from what the read found: a config the
        registry rejected, or a type that does not fit this dashboard's.
        Every widget is (re)assigned, ``None`` included, so flags are always
        a function of the current document rather than of its history."""
        for widget in dashboard.widgets:
            if isinstance(widget.config, InvalidWidgetConfig):
                widget.error = "invalid_config"
            elif not self._registry.accepts(widget.config.type, dashboard.type):
                widget.error = "incompatible_type"
            else:
                widget.error = None
        return dashboard

    def _ensure_fits(self, dashboard: Dashboard, widget_config: WidgetConfig) -> None:
        if not self._registry.accepts(widget_config.type, dashboard.type):
            msg = (
                f"Widget type {widget_config.type!r} is not allowed on a "
                f"{dashboard.type} dashboard"
            )
            raise InvalidError(msg)

    def _bottom_placement(
        self, dashboard: Dashboard, widget_config: WidgetConfig
    ) -> WidgetLayout:
        """Geometry for a new widget: full-width-left at the grid's bottom edge,
        sized to fit its content (at least the type's default footprint —
        there is no existing placement yet to grow from)."""
        bottom = max(
            (w.layout.y + w.layout.h for w in dashboard.widgets),
            default=0,
        )
        default_size = self._registry.default_size(widget_config.type)
        size = widget_config.content_size_hint(default_size)
        return WidgetLayout(x=0, y=bottom, w=size.w, h=size.h)

    def _grown_layout(
        self, layout: WidgetLayout, widget_config: WidgetConfig
    ) -> WidgetLayout:
        """*layout* grown to fit *widget_config*'s content; never shrunk.

        Hinted against *layout*'s own size, not the type's registry default:
        a type with no content-dependent sizing (the base no-op) must return
        its input unchanged here, or every config edit would snap a manually
        resized widget back to its type's default footprint.
        """
        hint = widget_config.content_size_hint(WidgetSize(w=layout.w, h=layout.h))
        return WidgetLayout(
            x=layout.x,
            y=layout.y,
            w=max(layout.w, hint.w),
            h=max(layout.h, hint.h),
        )

    @staticmethod
    def _find_widget(dashboard: Dashboard, widget_id: str) -> Widget:
        for widget in dashboard.widgets:
            if widget.id == widget_id:
                return widget
        msg = f"Widget {widget_id!r} not found on dashboard {dashboard.id!r}"
        raise NotFoundError(msg)

    @staticmethod
    def _validate_structure_bijection(
        update: DashboardStructureUpdate, current_ids: set[str]
    ) -> None:
        placed = dashboard_ids(update)
        if len(placed) != len(set(placed)):
            msg = "Structure places a dashboard more than once"
            raise InvalidError(msg)
        if set(placed) != current_ids:
            msg = "Structure must place every dashboard exactly once"
            raise InvalidError(msg)

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
