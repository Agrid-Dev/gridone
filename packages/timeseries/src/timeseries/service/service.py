from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from models.errors import InvalidError, NotFoundError
from models.pagination import Page, PaginationParams

from timeseries.domain import (
    DATA_TYPE_MAP,
    VALUE_TYPE_MAP,
    AttributeValueType,
    DataPoint,
    DataType,
    DeviceCommand,
    DeviceCommandCreate,
    SeriesKey,
    SortOrder,
    TimeSeries,
    resolve_last,
    validate_value_type,
)
from timeseries.domain.filters import CommandsQueryFilters
from timeseries.exporters.csv import to_csv
from timeseries.exporters.png import to_png

if TYPE_CHECKING:
    from datetime import datetime

    from timeseries.storage import TimeSeriesStorage


logger = logging.getLogger(__name__)


class TimeSeriesService:
    _storage: TimeSeriesStorage

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

    async def get_series(self, series_id: str) -> TimeSeries:
        series = await self._storage.get_series(series_id)
        if series is None:
            msg = f"Series not found: {series_id}"
            raise NotFoundError(msg)
        return series

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
        points: list[DataPoint[AttributeValueType]],
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
    ) -> list[DataPoint[AttributeValueType]]:
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
        carry_forward: bool = False,
    ) -> str:
        if last is not None and start is None:
            start = resolve_last(last)

        all_series = []
        for series_id in series_ids:
            series = await self.get_series(series_id)
            series.data_points = await self.fetch_points(
                series.key, start=start, end=end, carry_forward=carry_forward
            )
            all_series.append(series)

        return to_csv(all_series)

    async def log_command(self, command: DeviceCommandCreate) -> DeviceCommand:
        return await self._storage.save_command(command)

    async def export_png(  # noqa: PLR0913
        self,
        series_ids: list[str],
        *,
        start: datetime | None = None,
        end: datetime | None = None,
        last: str | None = None,
        carry_forward: bool = False,
        title: str | None = None,
    ) -> bytes:
        if last is not None and start is None:
            start = resolve_last(last)

        all_series = []
        for series_id in series_ids:
            series = await self.get_series(series_id)
            series.data_points = await self.fetch_points(
                series.key, start=start, end=end, carry_forward=carry_forward
            )
            all_series.append(series)

        return to_png(all_series, title=title, end=end)

    async def get_commands(  # noqa: PLR0913
        self,
        *,
        ids: list[int] | None = None,
        device_id: str | None = None,
        attribute: str | None = None,
        user_id: str | None = None,
        start: datetime | None = None,
        end: datetime | None = None,
        last: str | None = None,
        sort: SortOrder = SortOrder.ASC,
        pagination: PaginationParams | None = None,
    ) -> Page[DeviceCommand]:
        if ids is not None:
            other = (device_id, attribute, user_id, start, end, last)
            if any(f is not None for f in other):
                msg = "Cannot combine 'ids' with other filters"
                raise InvalidError(msg)
            items = await self._storage.query_commands_by_ids(ids)
            return Page(
                items=items,
                total=len(items),
                page=1,
                size=max(len(items), 1),
            )
        if last is not None and start is None:
            start = resolve_last(last)
        filters = CommandsQueryFilters(
            device_id=device_id,
            attribute=attribute,
            user_id=user_id,
            start=start,
            end=end,
        )
        total = await self._storage.count_commands(filters)
        if pagination is not None:
            items = await self._storage.query_commands(
                filters,
                sort=sort,
                limit=pagination.limit,
                offset=pagination.offset,
            )
            return Page(
                items=items, total=total, page=pagination.page, size=pagination.size
            )
        items = await self._storage.query_commands(filters, sort=sort)
        return Page(items=items, total=total, page=1, size=max(total, 1))
