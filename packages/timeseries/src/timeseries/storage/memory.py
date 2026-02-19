from __future__ import annotations

from copy import deepcopy
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from timeseries.errors import InvalidError, NotFoundError

if TYPE_CHECKING:
    from timeseries.domain import DataPoint, DataPointValue, SeriesKey, TimeSeries


class MemoryStorage:
    def __init__(self) -> None:
        self._series: dict[str, TimeSeries] = {}
        self._key_index: dict[SeriesKey, str] = {}

    async def create_series(self, series: TimeSeries) -> TimeSeries:
        if series.id in self._series:
            msg = f"Series {series.id} already exists"
            raise InvalidError(msg)
        if series.key in self._key_index:
            msg = f"Series with key {series.key} already exists"
            raise InvalidError(msg)
        stored = deepcopy(series)
        self._series[stored.id] = stored
        self._key_index[stored.key] = stored.id
        return deepcopy(stored)

    async def get_series(self, series_id: str) -> TimeSeries | None:
        series = self._series.get(series_id)
        return deepcopy(series) if series else None

    async def get_series_by_key(self, key: SeriesKey) -> TimeSeries | None:
        series_id = self._key_index.get(key)
        if series_id is None:
            return None
        return await self.get_series(series_id)

    async def list_series(
        self,
        *,
        owner_id: str | None = None,
        metric: str | None = None,
    ) -> list[TimeSeries]:
        results = self._series.values()

        if owner_id is not None:
            results = [s for s in results if s.owner_id == owner_id]
        if metric is not None:
            results = [s for s in results if s.metric == metric]
        return [deepcopy(s) for s in results]

    async def fetch_points(
        self,
        key: SeriesKey,
        *,
        start: datetime | None = None,
        end: datetime | None = None,
    ) -> list[DataPoint[DataPointValue]]:
        series_id = self._key_index.get(key)
        if series_id is None:
            return []
        points = self._series[series_id].data_points
        if start is not None:
            points = [p for p in points if p.timestamp >= start]
        if end is not None:
            points = [p for p in points if p.timestamp <= end]
        return list(points)

    async def upsert_points(
        self,
        key: SeriesKey,
        points: list[DataPoint[DataPointValue]],
    ) -> None:
        series_id = self._key_index.get(key)
        if series_id is None:
            msg = f"No series found for key {key}"
            raise NotFoundError(msg)
        series = self._series[series_id]
        existing = {p.timestamp: p for p in series.data_points}
        for p in points:
            existing[p.timestamp] = p
        series.data_points = sorted(existing.values(), key=lambda p: p.timestamp)
        series.updated_at = datetime.now(tz=UTC)
