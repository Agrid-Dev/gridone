from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from dashboards.models import (
    Dashboard,
    DashboardSummary,
    Metadata,
    Widget,
    WidgetLayout,
)
from models.errors import NotFoundError

if TYPE_CHECKING:
    import asyncpg

    from dashboards.widgets.registry import WidgetRegistry

logger = logging.getLogger(__name__)


def _widget_to_jsonb(widget: Widget) -> dict[str, Any]:
    """Serialize a widget to its stored JSON shape.

    ``config`` is dumped from the concrete instance (not the base type) so its
    type-specific fields survive the round-trip.
    """
    return {
        "id": widget.id,
        "title": widget.title,
        "description": widget.description,
        "config": widget.config.model_dump(mode="json"),
        "layout": widget.layout.model_dump(mode="json"),
        "metadata": widget.metadata.model_dump(mode="json"),
    }


class PostgresDashboardsStorage:
    def __init__(self, pool: asyncpg.Pool, registry: WidgetRegistry) -> None:
        self._pool = pool
        # The registry rebuilds each widget's concrete config model from stored
        # JSON — the base ``WidgetConfig`` alone can't discriminate on ``type``.
        self._registry = registry

    def _widget_from_jsonb(self, raw: dict[str, Any]) -> Widget:
        return Widget(
            id=raw["id"],
            title=raw.get("title"),
            description=raw.get("description"),
            config=self._registry.validate_config(raw["config"]),
            layout=WidgetLayout.model_validate(raw["layout"]),
            metadata=Metadata.model_validate(raw["metadata"]),
        )

    def _row_to_metadata(self, row: asyncpg.Record) -> Metadata:
        return Metadata(
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            created_by=row["created_by"],
            updated_by=row["updated_by"],
        )

    def _row_to_dashboard(self, row: asyncpg.Record) -> Dashboard:
        return Dashboard(
            id=row["id"],
            name=row["name"],
            description=row["description"],
            widgets=[self._widget_from_jsonb(w) for w in row["widgets"]],
            metadata=self._row_to_metadata(row),
        )

    def _row_to_summary(self, row: asyncpg.Record) -> DashboardSummary:
        return DashboardSummary(
            id=row["id"],
            name=row["name"],
            description=row["description"],
            metadata=self._row_to_metadata(row),
        )

    async def create(self, dashboard: Dashboard) -> Dashboard:
        row = await self._pool.fetchrow(
            """
            INSERT INTO dashboards
                (id, name, description, widgets,
                 created_at, updated_at, created_by, updated_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
            """,
            dashboard.id,
            dashboard.name,
            dashboard.description,
            [_widget_to_jsonb(w) for w in dashboard.widgets],
            dashboard.metadata.created_at,
            dashboard.metadata.updated_at,
            dashboard.metadata.created_by,
            dashboard.metadata.updated_by,
        )
        return self._row_to_dashboard(row)

    async def get(self, dashboard_id: str) -> Dashboard | None:
        row = await self._pool.fetchrow(
            "SELECT * FROM dashboards WHERE id = $1", dashboard_id
        )
        if row is None:
            return None
        return self._row_to_dashboard(row)

    async def list_summaries(
        self, *, limit: int | None = None, offset: int | None = None
    ) -> list[DashboardSummary]:
        query = (
            "SELECT id, name, description, created_at, updated_at, "
            "created_by, updated_by FROM dashboards ORDER BY created_at"
        )
        params: list[object] = []
        idx = 1
        if limit is not None:
            query += f" LIMIT ${idx}"
            params.append(limit)
            idx += 1
        if offset is not None:
            query += f" OFFSET ${idx}"
            params.append(offset)
        rows = await self._pool.fetch(query, *params)
        return [self._row_to_summary(r) for r in rows]

    async def count(self) -> int:
        return await self._pool.fetchval("SELECT COUNT(*) FROM dashboards")

    async def update(self, dashboard: Dashboard) -> Dashboard:
        row = await self._pool.fetchrow(
            """
            UPDATE dashboards
            SET name = $2, description = $3, widgets = $4,
                updated_at = $5, updated_by = $6
            WHERE id = $1
            RETURNING *
            """,
            dashboard.id,
            dashboard.name,
            dashboard.description,
            [_widget_to_jsonb(w) for w in dashboard.widgets],
            dashboard.metadata.updated_at,
            dashboard.metadata.updated_by,
        )
        if row is None:
            msg = f"Dashboard {dashboard.id!r} not found"
            raise NotFoundError(msg)
        return self._row_to_dashboard(row)

    async def delete(self, dashboard_id: str) -> None:
        row = await self._pool.fetchrow(
            "DELETE FROM dashboards WHERE id = $1 RETURNING id", dashboard_id
        )
        if row is None:
            msg = f"Dashboard {dashboard_id!r} not found"
            raise NotFoundError(msg)

    async def close(self) -> None:
        await self._pool.close()
