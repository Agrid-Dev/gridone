from __future__ import annotations

from typing import TYPE_CHECKING, Protocol

if TYPE_CHECKING:
    from collections.abc import Sequence

    from dashboards.models import Dashboard, DashboardSummary


class DashboardsStorage(Protocol):
    """Persistence for whole dashboard documents.

    The storage is deliberately dumb: it stores and returns whole
    :class:`Dashboard` aggregates (widgets and geometry included) and never
    reasons about widget mutation — that logic lives in the service, which
    reads a dashboard, mutates the aggregate, and writes it back via
    :meth:`update`.

    Dashboards have a display order owned by the storage: :meth:`create`
    appends last, :meth:`reorder` rewrites the whole order, and
    :meth:`list_summaries` returns it. The order is not a field of the
    aggregate.
    """

    async def create(self, dashboard: Dashboard) -> Dashboard:
        """Persist a new dashboard, last in display order."""
        ...

    async def get(self, dashboard_id: str) -> Dashboard | None: ...

    async def list_summaries(
        self, *, limit: int | None = None, offset: int | None = None
    ) -> list[DashboardSummary]:
        """Return dashboard summaries (no widgets/layout) in display order."""
        ...

    async def count(self) -> int: ...

    async def reorder(self, ordered_ids: Sequence[str]) -> None:
        """Set the display order to ``ordered_ids``. Callers pass the
        complete id set in the wanted order; the storage does not validate it."""
        ...

    async def update(self, dashboard: Dashboard) -> Dashboard:
        """Persist a full replacement of a dashboard. Raises
        :class:`models.errors.NotFoundError` when no row matches its id."""
        ...

    async def delete(self, dashboard_id: str) -> None:
        """Delete a dashboard. Raises :class:`models.errors.NotFoundError`
        when no row matches ``dashboard_id``."""
        ...

    async def close(self) -> None: ...
