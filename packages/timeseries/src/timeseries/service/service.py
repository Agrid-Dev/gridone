from __future__ import annotations

from typing import TYPE_CHECKING

from timeseries.domain import (
    DATA_TYPE_MAP,
    DataPoint,
    DataPointValue,
    DataType,
    SeriesKey,
    TimeSeries,
    validate_value_type,
)

if TYPE_CHECKING:
    from datetime import datetime

    from timeseries.storage import TimeSeriesStorage


class TimeSeriesService:
    def __init__(self, storage: TimeSeriesStorage) -> None:
        self._storage = storage

    async def create_series(
        self,
        *,
        data_type: DataType,
        owner_type: str,
        owner_id: str,
        metric: str,
    ) -> TimeSeries:
        key = SeriesKey(owner_id=owner_id, metric=metric)
        existing = await self._storage.get_series_by_key(key)
        if existing is not None:
            msg = f"Series already exists for {key}"
            raise ValueError(msg)
        series = TimeSeries(
            data_type=data_type,
            owner_type=owner_type,
            owner_id=owner_id,
            metric=metric,
        )
        return await self._storage.create_series(series)

    async def get_series(self, series_id: str) -> TimeSeries | None:
        return await self._storage.get_series(series_id)

    async def get_series_by_key(self, key: SeriesKey) -> TimeSeries | None:
        return await self._storage.get_series_by_key(key)

    async def list_series(
        self,
        *,
        owner_type: str | None = None,
        owner_id: str | None = None,
        metric: str | None = None,
    ) -> list[TimeSeries]:
        return await self._storage.list_series(
            owner_type=owner_type,
            owner_id=owner_id,
            metric=metric,
        )

    async def upsert_points(
        self,
        key: SeriesKey,
        points: list[DataPoint[DataPointValue]],
    ) -> None:
        series = await self._storage.get_series_by_key(key)
        if series is None:
            msg = f"No series found for {key}"
            raise KeyError(msg)
        expected = DATA_TYPE_MAP[series.data_type]
        for p in points:
            validate_value_type(p.value, expected)
        await self._storage.upsert_points(key, points)

    async def fetch_points(
        self,
        key: SeriesKey,
        *,
        start: datetime | None = None,
        end: datetime | None = None,
    ) -> list[DataPoint[DataPointValue]]:
        return await self._storage.fetch_points(key, start=start, end=end)
