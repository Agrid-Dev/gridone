from __future__ import annotations

import logging
from typing import TYPE_CHECKING, cast

from models.errors import InvalidError, NotFoundError, StorageConnectionError
from models.service import Service
from timeseries.domain import (
    DATA_TYPE_MAP,
    VALUE_TYPE_MAP,
    AggregationQuery,
    AggregationResult,
    DataPoint,
    DataType,
    SeriesKey,
    TimeSeries,
    normalize_to_utc,
    resolve_aggregation_data_type,
    resolve_last,
    validate_value_type,
)
from timeseries.exporters.csv import to_csv
from timeseries.exporters.png import to_png
from timeseries.storage import build_storage

if TYPE_CHECKING:
    from datetime import datetime

    from timeseries.storage import TimeSeriesStorage
    from timeseries.storage.postgres import PostgresStorage


logger = logging.getLogger(__name__)
_POSTGRES_PREFIX = "postgresql"


class TimeSeriesService(Service):
    _storage: TimeSeriesStorage | None

    def __init__(
        self,
        storage_url: str | None = None,
        *,
        default_timezone: str = "UTC",
    ) -> None:
        self._storage_url = storage_url
        self._storage = None
        self._default_timezone = default_timezone

    async def start(self) -> None:
        if self._is_postgres:
            await self._start_postgres()
            return

        self._storage = await build_storage(self._storage_url)

    async def _start_postgres(self) -> None:
        from timeseries.storage.postgres import run_migrations  # noqa: PLC0415

        storage = None
        try:
            run_migrations(cast("str", self._storage_url))
            storage = await build_storage(self._storage_url)
            postgres_storage = cast("PostgresStorage", storage)
            await postgres_storage.try_enable_hypertable()
        except StorageConnectionError:
            raise
        except Exception as e:
            if storage is not None:
                await storage.close()
            msg = "Failed to initialize timeseries postgres backend"
            raise StorageConnectionError(msg) from e

        self._storage = storage

    async def stop(self) -> None:
        if self._storage is not None:
            await self._storage.close()
            self._storage = None

    @property
    def default_timezone(self) -> str:
        return self._default_timezone

    @property
    def _backend(self) -> TimeSeriesStorage:
        if self._storage is None:
            msg = "TimeSeriesService.start() must be called before use"
            raise RuntimeError(msg)
        return self._storage

    @property
    def _is_postgres(self) -> bool:
        return self._storage_url is not None and self._storage_url.startswith(
            _POSTGRES_PREFIX
        )

    async def create_series(
        self,
        *,
        data_type: DataType,
        owner_id: str,
        metric: str,
    ) -> TimeSeries:
        key = SeriesKey(owner_id=owner_id, metric=metric)
        existing = await self._backend.get_series_by_key(key)
        if existing is not None:
            msg = f"Series already exists for {key}"
            raise InvalidError(msg)
        series = TimeSeries(
            data_type=data_type,
            owner_id=owner_id,
            metric=metric,
        )
        return await self._backend.create_series(series)

    async def get_series(self, series_id: str) -> TimeSeries:
        series = await self._backend.get_series(series_id)
        if series is None:
            msg = f"Series not found: {series_id}"
            raise NotFoundError(msg)
        return series

    async def get_series_by_key(self, key: SeriesKey) -> TimeSeries | None:
        return await self._backend.get_series_by_key(key)

    async def list_series(
        self,
        *,
        owner_id: str | None = None,
        metric: str | None = None,
    ) -> list[TimeSeries]:
        return await self._backend.list_series(
            owner_id=owner_id,
            metric=metric,
        )

    async def upsert_points(
        self,
        key: SeriesKey,
        points: list[DataPoint],
        *,
        create_if_not_found: bool = False,
        validate_data_type: DataType | None = None,
    ) -> None:
        storage = self._backend
        series = await storage.get_series_by_key(key)
        if series is None and not create_if_not_found:
            msg = f"No series found for {key}"
            raise NotFoundError(msg)
        if series is None:
            if validate_data_type is not None:
                data_type = validate_data_type
            elif not points:
                msg = "Cannot infer data_type from empty points list"
                raise InvalidError(msg)
            else:
                data_type = VALUE_TYPE_MAP[type(points[0].value)]
            logger.debug("Creating series %s", key)
            series = await storage.create_series(
                TimeSeries(
                    data_type=data_type,
                    owner_id=key.owner_id,
                    metric=key.metric,
                ),
            )
        expected = DATA_TYPE_MAP[series.data_type]
        for p in points:
            validate_value_type(p.value, expected)
        naive = [p.timestamp for p in points if p.timestamp.tzinfo is None]
        if naive:
            msg = (
                f"DataPoint timestamps must be timezone-aware; "
                f"got {len(naive)} naive timestamp(s)"
            )
            raise InvalidError(msg)
        logger.debug("Upserting %d points for %s", len(points), key)
        await storage.upsert_points(key, points)

    async def get_aggregate(
        self,
        key: SeriesKey,
        query: AggregationQuery,
    ) -> AggregationResult:
        if query.last is not None and query.start is None:
            query = query.model_copy(
                update={"start": resolve_last(query.last), "last": None}
            )
        query = query.model_copy(
            update={
                "start": normalize_to_utc(query.start, self._default_timezone),
                "end": normalize_to_utc(query.end, self._default_timezone),
                "timezone": query.timezone or self._default_timezone,
            }
        )
        series = await self._backend.get_series_by_key(key)
        if series is None:
            msg = f"No series found for {key}"
            raise NotFoundError(msg)
        if query.start is None or query.end is None:
            msg = "start and end are required for aggregation"
            raise InvalidError(msg)
        resolve_aggregation_data_type(query.agg, series.data_type)
        return await self._backend.aggregate(key, query)

    async def fetch_points(
        self,
        key: SeriesKey,
        *,
        start: datetime | None = None,
        end: datetime | None = None,
        last: str | None = None,
        carry_forward: bool = False,
    ) -> list[DataPoint]:
        if last is not None and start is None:
            start = resolve_last(last)
        start = normalize_to_utc(start, self._default_timezone)
        end = normalize_to_utc(end, self._default_timezone)
        return await self._fetch_points_utc(
            key, start=start, end=end, carry_forward=carry_forward
        )

    async def _fetch_points_utc(
        self,
        key: SeriesKey,
        *,
        start: datetime | None,
        end: datetime | None,
        carry_forward: bool,
    ) -> list[DataPoint]:
        storage = self._backend
        points = await storage.fetch_points(key, start=start, end=end)
        if carry_forward and start is not None:
            previous = await storage.fetch_point_before(key, before=start)
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
        start = normalize_to_utc(start, self._default_timezone)
        end = normalize_to_utc(end, self._default_timezone)

        all_series = []
        for series_id in series_ids:
            series = await self.get_series(series_id)
            series.data_points = await self._fetch_points_utc(
                series.key, start=start, end=end, carry_forward=carry_forward
            )
            all_series.append(series)

        return to_csv(all_series, timezone=self._default_timezone)

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
        start = normalize_to_utc(start, self._default_timezone)
        end = normalize_to_utc(end, self._default_timezone)

        all_series = []
        for series_id in series_ids:
            series = await self.get_series(series_id)
            series.data_points = await self._fetch_points_utc(
                series.key, start=start, end=end, carry_forward=carry_forward
            )
            all_series.append(series)

        return to_png(all_series, title=title, end=end, timezone=self._default_timezone)
