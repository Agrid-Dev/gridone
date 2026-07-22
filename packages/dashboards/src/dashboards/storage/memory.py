from __future__ import annotations

from dataclasses import dataclass, field

from dashboards.models import Dashboard, DashboardSummary
from models.errors import NotFoundError


@dataclass
class MemoryStorage:
    """In-process dashboard store. Default backend when no URL is given.

    Every read returns a deep copy and every write stores a deep copy, so
    callers can mutate what they get without touching persisted state — the
    same isolation a real database gives. Deep copies preserve each widget's
    concrete config subclass, so no registry is needed to reconstruct configs.
    """

    _dashboards: dict[str, Dashboard] = field(default_factory=dict)

    async def create(self, dashboard: Dashboard) -> Dashboard:
        self._dashboards[dashboard.id] = dashboard.model_copy(deep=True)
        return dashboard.model_copy(deep=True)

    async def get(self, dashboard_id: str) -> Dashboard | None:
        dashboard = self._dashboards.get(dashboard_id)
        return dashboard.model_copy(deep=True) if dashboard is not None else None

    async def list_summaries(
        self, *, limit: int | None = None, offset: int | None = None
    ) -> list[DashboardSummary]:
        dashboards = sorted(
            self._dashboards.values(), key=lambda d: d.metadata.created_at
        )
        if offset is not None:
            dashboards = dashboards[offset:]
        if limit is not None:
            dashboards = dashboards[:limit]
        return [
            DashboardSummary(
                id=d.id,
                name=d.name,
                description=d.description,
                metadata=d.metadata.model_copy(deep=True),
            )
            for d in dashboards
        ]

    async def count(self) -> int:
        return len(self._dashboards)

    async def update(self, dashboard: Dashboard) -> Dashboard:
        if dashboard.id not in self._dashboards:
            msg = f"Dashboard {dashboard.id!r} not found"
            raise NotFoundError(msg)
        self._dashboards[dashboard.id] = dashboard.model_copy(deep=True)
        return dashboard.model_copy(deep=True)

    async def delete(self, dashboard_id: str) -> None:
        if dashboard_id not in self._dashboards:
            msg = f"Dashboard {dashboard_id!r} not found"
            raise NotFoundError(msg)
        del self._dashboards[dashboard_id]

    async def close(self) -> None:
        pass
