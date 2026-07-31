from __future__ import annotations

import asyncio
import contextlib
import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Literal, cast

from models.errors import InvalidError, NotFoundError, StorageConnectionError
from models.service import Service
from timeseries.domain import (
    AGG_COMPAT,
    DATA_TYPE_MAP,
    VALUE_TYPE_MAP,
    AggregatedPoint,
    AggregationOperator,
    AggregationQuery,
    AggregationResult,
    DataPoint,
    DataType,
    FetchPointsResult,
    Interval,
    SeriesKey,
    SpaceAggregationResult,
    TimeSeries,
    combine_space,
    normalize_to_utc,
    parse_duration,
    resolve_aggregation_data_type,
    resolve_last,
    resolve_space_aggregation_data_type,
    validate_tz_name,
    validate_value_type,
)
from timeseries.exporters.csv import to_csv
from timeseries.exporters.png import to_png
from timeseries.service.auto_interval import (
    CANONICAL_INTERVALS,
    resolve_auto_interval,
    valid_intervals_for_period,
)
from timeseries.storage import build_storage

if TYPE_CHECKING:
    from timeseries.storage import TimeSeriesStorage
    from timeseries.storage.postgres import PostgresStorage


logger = logging.getLogger(__name__)
_POSTGRES_PREFIX = "postgresql"


@dataclass
class AggregateOptions:
    intervals: list[tuple[str, int | None]]  # (interval_str, bucket_count)
    recommended_interval: str | None
    operators_by_data_type: dict[DataType, dict[AggregationOperator, DataType | None]]


def _build_operators_by_data_type() -> dict[
    DataType, dict[AggregationOperator, DataType | None]
]:
    """Transpose the compatibility matrix to data-type-major, keeping every
    operator.

    Every operator appears against every data type, mapped to the type it
    yields — or ``None`` where the pair is invalid. Listing only the valid ones
    would leave a caller unable to tell an operator that does not apply from one
    it has never heard of, and unable to say what it would get back: ``count``
    yields an int whatever went in, and averaging a bool yields a float.
    """
    return {
        dt: {op: AGG_COMPAT[op][dt] for op in AggregationOperator} for dt in DataType
    }


_OPERATORS_BY_DATA_TYPE: dict[DataType, dict[AggregationOperator, DataType | None]] = (
    _build_operators_by_data_type()
)

DEFAULT_RAW_LIMIT = 10_000
MAX_RAW_LIMIT = 100_000


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _resolve_interval(
    query: AggregationQuery, period: timedelta
) -> Interval | Literal["raw", "whole"]:
    """Resolve ``interval="auto"`` to the bucket width the backends expect."""
    if query.interval != "auto":
        return query.interval
    interval = resolve_auto_interval(period)
    return "whole" if interval == "whole" else Interval.model_validate(interval)


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

    async def rename_metric_for_owners(
        self,
        owner_ids: list[str],
        old_metric: str,
        new_metric: str,
    ) -> None:
        """Rename a metric across all owners' series, validating before any write."""
        keys = [
            SeriesKey(owner_id=owner_id, metric=old_metric) for owner_id in owner_ids
        ]
        for key in keys:
            new_key = SeriesKey(owner_id=key.owner_id, metric=new_metric)
            if new_key != key and await self._backend.get_series_by_key(new_key):
                msg = f"Series with key {new_key} already exists"
                raise InvalidError(msg)
        renamed: list[SeriesKey] = []
        try:
            for key in keys:
                await self._backend.rename_series(key, new_metric)
                renamed.append(key)
        except Exception:
            for key in reversed(renamed):
                new_key = SeriesKey(owner_id=key.owner_id, metric=new_metric)
                with contextlib.suppress(Exception):
                    await self._backend.rename_series(new_key, old_metric)
            raise

    async def get_aggregate(
        self,
        key: SeriesKey,
        query: AggregationQuery,
    ) -> AggregationResult:
        cutoff = _utcnow()
        resolved_tz = query.timezone or self._default_timezone
        query = query.model_copy(
            update={
                "start": normalize_to_utc(query.start, resolved_tz),
                "end": normalize_to_utc(query.end or cutoff, resolved_tz),
                "timezone": resolved_tz,
            }
        )
        series = await self._backend.get_series_by_key(key)
        if series is None:
            owner, metric = key.owner_id, key.metric
            msg = f"No timeseries found for device '{owner}', attribute '{metric}'"
            raise NotFoundError(msg)
        if query.start is None:
            msg = "start (or last) is required for aggregation"
            raise InvalidError(msg)
        resolve_aggregation_data_type(query.agg, series.data_type)

        start: datetime = query.start
        end: datetime = query.end or cutoff  # end always set by model_copy above
        interval = _resolve_interval(query, end - start)
        if interval == "raw":
            return await self._get_aggregate_raw(key, query, series.data_type)
        # The backends require a resolved interval — "auto" must never reach them.
        query = query.model_copy(update={"interval": interval})
        return await self._backend.aggregate(key, query)

    async def get_aggregate_many(
        self,
        keys: list[SeriesKey],
        query: AggregationQuery,
        space_agg: AggregationOperator,
    ) -> SpaceAggregationResult:
        """Time-aggregate every series in *keys*, then fold buckets in space.

        Every series runs the same resolved query, so the gap-filled bucket
        grids line up and *space_agg* reduces each bucket's values across
        series. Keys without a series are skipped (a device may expose the
        attribute without recorded history); a bucket only counts the series
        that hold a value there, which is how sets with different history
        bounds stay aggregable.
        """
        cutoff = _utcnow()
        resolved_tz = query.timezone or self._default_timezone
        query = query.model_copy(
            update={
                "start": normalize_to_utc(query.start, resolved_tz),
                "end": normalize_to_utc(query.end or cutoff, resolved_tz),
                "timezone": resolved_tz,
            }
        )
        if query.start is None:
            msg = "start (or last) is required for aggregation"
            raise InvalidError(msg)

        maybe_series = await asyncio.gather(
            *(self._backend.get_series_by_key(key) for key in keys)
        )
        series = [s for s in maybe_series if s is not None]
        if not series:
            msg = "No timeseries found for any device in the target"
            raise NotFoundError(msg)
        data_types = {s.data_type for s in series}
        if len(data_types) > 1:
            listed = ", ".join(sorted(dt.value for dt in data_types))
            msg = f"Series in the target have mixed data types: {listed}"
            raise InvalidError(msg)
        data_type = next(iter(data_types))
        time_output = resolve_aggregation_data_type(query.agg, data_type)
        resolve_space_aggregation_data_type(space_agg, time_output)

        end: datetime = query.end or cutoff
        interval = _resolve_interval(query, end - query.start)
        if interval == "raw":
            msg = "Space aggregation requires bucketed series; 'raw' is not supported"
            raise InvalidError(msg)
        query = query.model_copy(update={"interval": interval})

        results = await asyncio.gather(
            *(self._backend.aggregate(s.key, query) for s in series)
        )
        result = SpaceAggregationResult(
            interval=interval,
            agg=query.agg,
            space_agg=space_agg,
            data_type=data_type,
            timezone=resolved_tz,
            series_count=len(series),
            points=combine_space(list(results), space_agg),
        )
        # The service resolves the timezone, so it also applies it: every
        # controller reads timestamps already rendered in it, instead of each
        # one having to remember to.
        return result.localized()

    async def get_aggregate_options(
        self,
        *,
        start: datetime | None = None,
        end: datetime | None = None,
        last: str | None = None,
    ) -> AggregateOptions:
        if end is not None and start is None and last is None:
            msg = "end requires start or last"
            raise InvalidError(msg)

        if last is not None or start is not None:
            now = _utcnow()
            resolved_start = start if start is not None else resolve_last(last, now=now)  # type: ignore[arg-type]
            resolved_end = end if end is not None else now
            period = resolved_end - resolved_start
            valid = valid_intervals_for_period(period)
            recommended = resolve_auto_interval(period)
            iv_td = {
                iv: parse_duration(iv) for iv in valid if iv not in {"raw", "whole"}
            }
            intervals: list[tuple[str, int | None]] = []
            for iv in valid:
                if iv == "raw":
                    intervals.append(("raw", None))
                elif iv == "whole":
                    intervals.append(("whole", 1))
                else:
                    intervals.append((iv, int(period / iv_td[iv])))
            return AggregateOptions(
                intervals=intervals,
                recommended_interval=recommended,
                operators_by_data_type=_OPERATORS_BY_DATA_TYPE,
            )

        # No time range given: every interval is offered, none can be sized.
        default_intervals: list[tuple[str, int | None]] = [
            ("raw", None),
            ("whole", None),
            *[(iv, None) for iv in CANONICAL_INTERVALS],
        ]
        return AggregateOptions(
            intervals=default_intervals,
            recommended_interval=None,
            operators_by_data_type=_OPERATORS_BY_DATA_TYPE,
        )

    async def _get_aggregate_raw(
        self,
        key: SeriesKey,
        query: AggregationQuery,
        data_type: DataType,
    ) -> AggregationResult:
        fetch = await self._fetch_points_utc(
            key,
            start=query.start,
            end=query.end,
            carry_forward=False,
            limit=MAX_RAW_LIMIT,
        )
        wrapped = [
            AggregatedPoint(interval_start=p.timestamp, value=p.value, count=1)
            for p in fetch.points
        ]
        return AggregationResult(
            interval="raw",
            agg=query.agg,
            data_type=data_type,
            timezone=query.timezone or self._default_timezone,
            points=wrapped,
            truncated=fetch.truncated,
        )

    async def fetch_points(  # noqa: PLR0913
        self,
        key: SeriesKey,
        *,
        start: datetime | None = None,
        end: datetime | None = None,
        last: str | None = None,
        carry_forward: bool = False,
        timezone: str | None = None,
        limit: int | None = None,
    ) -> FetchPointsResult:
        if timezone is not None:
            validate_tz_name(timezone)
        resolved_tz = timezone or self._default_timezone
        if limit is not None and not (1 <= limit <= MAX_RAW_LIMIT):
            msg = f"limit must be between 1 and {MAX_RAW_LIMIT}"
            raise InvalidError(msg)
        effective_limit = limit if limit is not None else DEFAULT_RAW_LIMIT
        if last is not None and start is None:
            start = resolve_last(last)
        start = normalize_to_utc(start, resolved_tz)
        end = normalize_to_utc(end, resolved_tz)
        return await self._fetch_points_utc(
            key,
            start=start,
            end=end,
            carry_forward=carry_forward,
            limit=effective_limit,
        )

    async def _fetch_points_utc(
        self,
        key: SeriesKey,
        *,
        start: datetime | None,
        end: datetime | None,
        carry_forward: bool,
        limit: int,
    ) -> FetchPointsResult:
        storage = self._backend
        raw = await storage.fetch_points(key, start=start, end=end, limit=limit)
        if len(raw) == limit + 1:
            next_start = raw[limit].timestamp
            points: list[DataPoint] = list(raw[:limit])
            truncated = True
        else:
            points = list(raw)
            truncated = False
            next_start = None
        if carry_forward and start is not None:
            previous = await storage.fetch_point_before(key, before=start)
            if previous is not None:
                carried = DataPoint(timestamp=start, value=previous.value)
                if truncated:
                    next_start = points[-1].timestamp
                    points = [carried, *points[:-1]]
                else:
                    points = [carried, *points]
        return FetchPointsResult(
            points=points, truncated=truncated, next_start=next_start
        )

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
        any_truncated = False
        for series_id in series_ids:
            series = await self.get_series(series_id)
            result = await self._fetch_points_utc(
                series.key,
                start=start,
                end=end,
                carry_forward=carry_forward,
                limit=MAX_RAW_LIMIT,
            )
            series.data_points = result.points
            all_series.append(series)
            if result.truncated:
                any_truncated = True

        csv_content = to_csv(all_series, timezone=self._default_timezone)
        if any_truncated:
            total = sum(len(s.data_points) for s in all_series)
            csv_content += f"\n# truncated to {total} points"
        return csv_content

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
        any_truncated = False
        for series_id in series_ids:
            series = await self.get_series(series_id)
            result = await self._fetch_points_utc(
                series.key,
                start=start,
                end=end,
                carry_forward=carry_forward,
                limit=MAX_RAW_LIMIT,
            )
            series.data_points = result.points
            all_series.append(series)
            if result.truncated:
                any_truncated = True

        effective_title = title
        if any_truncated:
            total = sum(len(s.data_points) for s in all_series)
            suffix = f"truncated to {total} points"
            effective_title = f"{title} ({suffix})" if title else suffix

        return to_png(
            all_series, title=effective_title, end=end, timezone=self._default_timezone
        )
