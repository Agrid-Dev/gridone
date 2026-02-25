from __future__ import annotations

import logging
from typing import TYPE_CHECKING

import asyncpg
from models.errors import InvalidError, NotFoundError

from timeseries.domain import DataPoint, DataType, SeriesKey, TimeSeries

if TYPE_CHECKING:
    from datetime import datetime

    from timeseries.domain import DataPointValue

logger = logging.getLogger(__name__)

_CREATE_SERIES_TABLE = """\
CREATE TABLE IF NOT EXISTS ts_series (
    id          TEXT        NOT NULL,
    data_type   TEXT        NOT NULL,
    owner_id    TEXT        NOT NULL,
    metric      TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ts_series_pkey PRIMARY KEY (id),
    CONSTRAINT ts_series_owner_metric_uq UNIQUE (owner_id, metric)
);
"""

_CREATE_SERIES_INDEXES = [
    "CREATE INDEX IF NOT EXISTS idx_ts_series_owner_id ON ts_series (owner_id);",
    "CREATE INDEX IF NOT EXISTS idx_ts_series_metric   ON ts_series (metric);",
]

_CREATE_DATA_POINTS_TABLE = """\
CREATE TABLE IF NOT EXISTS ts_data_points (
    series_id     TEXT            NOT NULL REFERENCES ts_series (id) ON DELETE CASCADE,
    timestamp     TIMESTAMPTZ     NOT NULL,
    value_integer BIGINT,
    value_float   DOUBLE PRECISION,
    value_boolean BOOLEAN,
    value_string  TEXT,
    PRIMARY KEY (series_id, timestamp)
);
"""

_CREATE_HYPERTABLE = (
    "SELECT create_hypertable('ts_data_points', 'timestamp', if_not_exists => TRUE);"
)

_VALUE_COLUMNS: dict[DataType, str] = {
    DataType.INTEGER: "value_integer",
    DataType.FLOAT: "value_float",
    DataType.BOOLEAN: "value_boolean",
    DataType.STRING: "value_string",
}


class PostgresStorage:
    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    async def ensure_schema(self) -> None:
        async with self._pool.acquire() as conn:
            async with conn.transaction():
                await conn.execute(_CREATE_SERIES_TABLE)
                for stmt in _CREATE_SERIES_INDEXES:
                    await conn.execute(stmt)
                await conn.execute(_CREATE_DATA_POINTS_TABLE)

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
    ) -> list[DataPoint[DataPointValue]]:
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
            f"SELECT timestamp, {value_col} AS value "  # noqa: S608
            f"FROM ts_data_points WHERE {' AND '.join(clauses)} "
            "ORDER BY timestamp"
        )

        rows = await self._pool.fetch(query, *params)
        return [DataPoint(timestamp=r["timestamp"], value=r["value"]) for r in rows]

    async def fetch_point_before(
        self,
        key: SeriesKey,
        *,
        before: datetime,
    ) -> DataPoint[DataPointValue] | None:
        series = await self.get_series_by_key(key)
        if series is None:
            return None

        value_col = _VALUE_COLUMNS[series.data_type]

        query = (
            f"SELECT timestamp, {value_col} AS value "  # noqa: S608
            "FROM ts_data_points "
            "WHERE series_id = $1 AND timestamp < $2 "
            "ORDER BY timestamp DESC LIMIT 1"
        )
        row = await self._pool.fetchrow(query, series.id, before)
        if row is None:
            return None
        return DataPoint(timestamp=row["timestamp"], value=row["value"])

    async def upsert_points(
        self,
        key: SeriesKey,
        points: list[DataPoint[DataPointValue]],
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
                f"INSERT INTO ts_data_points (series_id, timestamp, {value_col}) "  # noqa: S608
                f"VALUES ($1, $2, $3) "
                f"ON CONFLICT (series_id, timestamp) "
                f"DO UPDATE SET {value_col} = EXCLUDED.{value_col}",
                [(series.id, p.timestamp, p.value) for p in points],
            )
            await conn.execute(
                "UPDATE ts_series SET updated_at = NOW() WHERE id = $1",
                series.id,
            )
