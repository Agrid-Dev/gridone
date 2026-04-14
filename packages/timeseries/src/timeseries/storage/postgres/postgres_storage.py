from __future__ import annotations

import logging
from typing import TYPE_CHECKING

import asyncpg

from models.errors import InvalidError, NotFoundError
from timeseries.domain import (
    DataPoint,
    DataType,
    SeriesKey,
    TimeSeries,
)

if TYPE_CHECKING:
    from datetime import datetime

logger = logging.getLogger(__name__)

_CREATE_HYPERTABLE = (
    "SELECT create_hypertable('ts_data_points', 'timestamp', if_not_exists => TRUE);"
)

_VALUE_COLUMNS: dict[DataType, str] = {
    DataType.INT: "value_integer",
    DataType.FLOAT: "value_float",
    DataType.BOOL: "value_boolean",
    DataType.STRING: "value_string",
}


class PostgresStorage:
    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    async def try_enable_hypertable(self) -> None:
        """Best-effort TimescaleDB hypertable conversion."""
        async with self._pool.acquire() as conn:
            try:
                await conn.execute(_CREATE_HYPERTABLE)
            except asyncpg.UndefinedFunctionError:
                logger.warning(
                    "TimescaleDB not available — ts_data_points remains a regular table"
                )

    @staticmethod
    def _row_to_series(row: asyncpg.Record) -> TimeSeries:
        return TimeSeries(
            id=row["id"],
            data_type=DataType(row["data_type"]),
            owner_id=row["owner_id"],
            metric=row["metric"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            data_points=[],
        )

    async def create_series(self, series: TimeSeries) -> TimeSeries:
        try:
            row = await self._pool.fetchrow(
                """
                INSERT INTO ts_series
                    (id, data_type, owner_id, metric, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING *
                """,
                series.id,
                series.data_type.value,
                series.owner_id,
                series.metric,
                series.created_at,
                series.updated_at,
            )
        except asyncpg.UniqueViolationError as exc:
            if "ts_series_pkey" in str(exc):
                msg = f"Series {series.id} already exists"
            else:
                msg = f"Series with key {series.key} already exists"
            raise InvalidError(msg) from exc

        return self._row_to_series(row)

    async def get_series(self, series_id: str) -> TimeSeries | None:
        row = await self._pool.fetchrow(
            "SELECT * FROM ts_series WHERE id = $1",
            series_id,
        )
        return self._row_to_series(row) if row else None

    async def get_series_by_key(self, key: SeriesKey) -> TimeSeries | None:
        row = await self._pool.fetchrow(
            "SELECT * FROM ts_series WHERE owner_id = $1 AND metric = $2",
            key.owner_id,
            key.metric,
        )
        return self._row_to_series(row) if row else None

    async def list_series(
        self,
        *,
        owner_id: str | None = None,
        metric: str | None = None,
    ) -> list[TimeSeries]:
        clauses: list[str] = []
        params: list[str] = []
        idx = 1

        if owner_id is not None:
            clauses.append(f"owner_id = ${idx}")
            params.append(owner_id)
            idx += 1
        if metric is not None:
            clauses.append(f"metric = ${idx}")
            params.append(metric)

        query = "SELECT * FROM ts_series"
        if clauses:
            query += " WHERE " + " AND ".join(clauses)

        rows = await self._pool.fetch(query, *params)
        return [self._row_to_series(r) for r in rows]

    async def fetch_points(
        self,
        key: SeriesKey,
        *,
        start: datetime | None = None,
        end: datetime | None = None,
    ) -> list[DataPoint]:
        series = await self.get_series_by_key(key)
        if series is None:
            return []

        value_col = _VALUE_COLUMNS[series.data_type]

        clauses = ["series_id = $1"]
        params: list[object] = [series.id]
        idx = 2

        if start is not None:
            clauses.append(f"timestamp >= ${idx}")
            params.append(start)
            idx += 1
        if end is not None:
            clauses.append(f"timestamp <= ${idx}")
            params.append(end)

        query = (
            f"SELECT timestamp, {value_col} AS value, command_id "  # noqa: S608
            f"FROM ts_data_points WHERE {' AND '.join(clauses)} "
            "ORDER BY timestamp"
        )

        rows = await self._pool.fetch(query, *params)
        return [
            DataPoint(
                timestamp=r["timestamp"], value=r["value"], command_id=r["command_id"]
            )
            for r in rows
        ]

    async def fetch_point_before(
        self,
        key: SeriesKey,
        *,
        before: datetime,
    ) -> DataPoint | None:
        series = await self.get_series_by_key(key)
        if series is None:
            return None

        value_col = _VALUE_COLUMNS[series.data_type]

        query = (
            f"SELECT timestamp, {value_col} AS value, command_id "  # noqa: S608
            "FROM ts_data_points "
            "WHERE series_id = $1 AND timestamp < $2 "
            "ORDER BY timestamp DESC LIMIT 1"
        )
        row = await self._pool.fetchrow(query, series.id, before)
        if row is None:
            return None
        return DataPoint(
            timestamp=row["timestamp"], value=row["value"], command_id=row["command_id"]
        )

    async def upsert_points(
        self,
        key: SeriesKey,
        points: list[DataPoint],
    ) -> None:
        series = await self.get_series_by_key(key)
        if series is None:
            msg = f"No series found for key {key}"
            raise NotFoundError(msg)

        if not points:
            return

        value_col = _VALUE_COLUMNS[series.data_type]

        async with self._pool.acquire() as conn, conn.transaction():
            await conn.executemany(
                "INSERT INTO ts_data_points"  # noqa: S608
                f" (series_id, timestamp, {value_col}, command_id)"
                " VALUES ($1, $2, $3, $4)"
                " ON CONFLICT (series_id, timestamp) DO UPDATE SET"
                f" {value_col} = EXCLUDED.{value_col},"
                " command_id ="
                " COALESCE(EXCLUDED.command_id, ts_data_points.command_id)",
                [(series.id, p.timestamp, p.value, p.command_id) for p in points],
            )
            await conn.execute(
                "UPDATE ts_series SET updated_at = NOW() WHERE id = $1",
                series.id,
            )

    async def close(self) -> None:
        await self._pool.close()
