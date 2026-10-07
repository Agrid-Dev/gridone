from __future__ import annotations

from typing import TYPE_CHECKING, Protocol

if TYPE_CHECKING:
    from dashboards.models import Dashboard, DashboardSummary
    from dashboards.structure import DashboardStructureUpdate


class DashboardsStorage(Protocol):
    """Persistence for whole dashboard documents and the structure document.

    The storage is deliberately dumb: it stores and returns whole
    :class:`Dashboard` aggregates (widgets and geometry included) and never
    reasons about widget mutation — that logic lives in the service, which
    reads a dashboard, mutates the aggregate, and writes it back via
    :meth:`update`. The structure (how dashboards are arranged for
    navigation) is one more document, stored and returned whole; the service
    reconciles it with the dashboards that exist.
    """

    async def create(self, dashboard: Dashboard) -> Dashboard: ...

    async def get(self, dashboard_id: str) -> Dashboard | None: ...

    async def list_summaries(self) -> list[DashboardSummary]:
        """Every dashboard's summary (no widgets/layout), in creation order.
        Display order is the structure's business."""
        ...

    async def update(self, dashboard: Dashboard) -> Dashboard:
        """Persist a full replacement of a dashboard. Raises
        :class:`models.errors.NotFoundError` when no row matches its id."""
        ...

    async def delete(self, dashboard_id: str) -> None:
        """Delete a dashboard. Raises :class:`models.errors.NotFoundError`
        when no row matches ``dashboard_id``."""
        ...

    async def get_structure(self) -> DashboardStructureUpdate:
        """The structure document as last stored; empty before the first
        write."""
        ...

    async def update_structure(self, document: DashboardStructureUpdate) -> None: ...

    async def close(self) -> None: ...
