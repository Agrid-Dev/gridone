from __future__ import annotations

from typing import TYPE_CHECKING, Protocol

if TYPE_CHECKING:
    from datetime import datetime

    from timeseries.domain import DataPoint, DataPointValue, SeriesKey, TimeSeries


class TimeSeriesStorage(Protocol):
    async def create_series(self, series: TimeSeries) -> TimeSeries: ...

    async def get_series(self, series_id: str) -> TimeSeries | None: ...

    async def get_series_by_key(self, key: SeriesKey) -> TimeSeries | None: ...

    async def list_series(
        self,
        *,
        owner_id: str | None = None,
        metric: str | None = None,
    ) -> list[TimeSeries]: ...

    async def fetch_points(
        self,
        key: SeriesKey,
        *,
        start: datetime | None = None,
        end: datetime | None = None,
    ) -> list[DataPoint[DataPointValue]]: ...

    async def upsert_points(
        self,
        key: SeriesKey,
        points: list[DataPoint[DataPointValue]],
    ) -> None: ...
