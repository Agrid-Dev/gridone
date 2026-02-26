from __future__ import annotations

import csv
import io
import logging
from typing import TYPE_CHECKING
from zoneinfo import ZoneInfo

from models.errors import InvalidError, NotFoundError

from timeseries.domain import (
    DATA_TYPE_MAP,
    VALUE_TYPE_MAP,
    DataPoint,
    DataPointValue,
    DataType,
    SeriesKey,
    TimeSeries,
    resolve_last,
    validate_value_type,
)

if TYPE_CHECKING:
    from datetime import datetime

    from timeseries.storage import TimeSeriesStorage


logger = logging.getLogger(__name__)


class TimeSeriesService:
    def __init__(self, storage: TimeSeriesStorage) -> None:
        self._storage = storage

    async def create_series(
        self,
        *,
        data_type: DataType,
        owner_id: str,
        metric: str,
    ) -> TimeSeries:
        key = SeriesKey(owner_id=owner_id, metric=metric)
        existing = await self._storage.get_series_by_key(key)
        if existing is not None:
            msg = f"Series already exists for {key}"
            raise InvalidError(msg)
        series = TimeSeries(
            data_type=data_type,
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
        owner_id: str | None = None,
        metric: str | None = None,
    ) -> list[TimeSeries]:
        return await self._storage.list_series(
            owner_id=owner_id,
            metric=metric,
        )

    async def upsert_points(
        self,
        key: SeriesKey,
        points: list[DataPoint[DataPointValue]],
        *,
        create_if_not_found: bool = False,
    ) -> None:
        series = await self._storage.get_series_by_key(key)
        if series is None and not create_if_not_found:
            msg = f"No series found for {key}"
            raise NotFoundError(msg)
        if series is None:
            if not points:
                msg = "Cannot infer data_type from empty points list"
                raise InvalidError(msg)
            data_type = VALUE_TYPE_MAP[type(points[0].value)]
            logger.debug("Creating series %s", key)
            series = await self._storage.create_series(
                TimeSeries(
                    data_type=data_type,
                    owner_id=key.owner_id,
                    metric=key.metric,
                ),
            )
        expected = DATA_TYPE_MAP[series.data_type]
        for p in points:
            validate_value_type(p.value, expected)
        logger.debug("Upserting %d points for %s", len(points), key)
        await self._storage.upsert_points(key, points)

    async def fetch_points(
        self,
        key: SeriesKey,
        *,
        start: datetime | None = None,
        end: datetime | None = None,
        last: str | None = None,
        carry_forward: bool = False,
    ) -> list[DataPoint[DataPointValue]]:
        if last is not None and start is None:
            start = resolve_last(last)
        points = await self._storage.fetch_points(key, start=start, end=end)
        if carry_forward and start is not None:
            previous = await self._storage.fetch_point_before(key, before=start)
            if previous is not None:
                carried = DataPoint(timestamp=start, value=previous.value)
                points = [carried, *points]
        return points

    async def export_csv(
        self,
        series_ids: list[str],
        *,
        start: datetime | None = None,
        end: datetime | None = None,
        last: str | None = None,
        timezone: str = "UTC",
    ) -> str:
        if last is not None and start is None:
            start = resolve_last(last)

        tz = ZoneInfo(timezone)

        all_series = []
        all_points = []
        for series_id in series_ids:
            series = await self._storage.get_series(series_id)
            if series is None:
                msg = f"Series not found: {series_id}"
                raise NotFoundError(msg)
            points = await self.fetch_points(
                series.key, start=start, end=end, carry_forward=True
            )
            all_series.append(series)
            all_points.append(points)

        all_timestamps = sorted({p.timestamp for pts in all_points for p in pts})

        series_point_maps = [{p.timestamp: p.value for p in pts} for pts in all_points]

        sio = io.StringIO()
        writer = csv.writer(sio)
        writer.writerow(["timestamp"] + [s.metric for s in all_series])

        last_values: list[DataPointValue | None] = [None] * len(all_series)
        for ts in all_timestamps:
            for i, point_map in enumerate(series_point_maps):
                if ts in point_map:
                    last_values[i] = point_map[ts]
            localized_ts = ts.astimezone(tz).isoformat()
            row = [localized_ts] + [v if v is not None else "" for v in last_values]
            writer.writerow(row)

        return sio.getvalue()
