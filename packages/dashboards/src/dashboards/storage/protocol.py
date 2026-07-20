from __future__ import annotations

from typing import TYPE_CHECKING, Protocol

if TYPE_CHECKING:
    from dashboards.models import Dashboard, DashboardSummary


class DashboardsStorage(Protocol):
    """Persistence for whole dashboard documents.

    The storage is deliberately dumb: it stores and returns whole
    :class:`Dashboard` aggregates (widgets and geometry included) and never
    reasons about widget mutation — that logic lives in the service, which
    reads a dashboard, mutates the aggregate, and writes it back via
    :meth:`update`.
    """

    async def create(self, dashboard: Dashboard) -> Dashboard: ...

    async def get(self, dashboard_id: str) -> Dashboard | None: ...

    async def list_summaries(
        self, *, limit: int | None = None, offset: int | None = None
    ) -> list[DashboardSummary]:
        """Return dashboard summaries (no widgets/layout) in stable order."""
        ...

    async def count(self) -> int: ...

    async def update(self, dashboard: Dashboard) -> Dashboard:
        """Persist a full replacement of a dashboard. Raises
        :class:`models.errors.NotFoundError` when no row matches its id."""
        ...

    async def delete(self, dashboard_id: str) -> None:
        """Delete a dashboard. Raises :class:`models.errors.NotFoundError`
        when no row matches ``dashboard_id``."""
        ...

    async def close(self) -> None: ...
