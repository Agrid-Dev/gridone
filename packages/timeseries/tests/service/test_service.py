from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

import pytest
import pytest_asyncio

from models.errors import InvalidError, NotFoundError
from timeseries.domain import (
    DataPoint,
    DataType,
    FetchPointsResult,
    SeriesKey,
)
from timeseries.service import TimeSeriesService
from timeseries.service.service import MAX_RAW_LIMIT

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

pytestmark = pytest.mark.asyncio

KEY = SeriesKey(owner_id="s1", metric="temperature")


@pytest_asyncio.fixture
async def service() -> AsyncIterator[TimeSeriesService]:
    service = TimeSeriesService(storage_url=None)
    await service.start()
    yield service
    await service.stop()


class TestInit:
    async def test_default_timezone_is_utc(self):
        service = TimeSeriesService(storage_url=None)
        assert service.default_timezone == "UTC"

    async def test_custom_timezone_stored(self):
        service = TimeSeriesService(storage_url=None, default_timezone="Europe/Paris")
        assert service.default_timezone == "Europe/Paris"


class TestCreateSeries:
    async def test_create(self, service: TimeSeriesService):
        series = await service.create_series(
            data_type=DataType.FLOAT,
            owner_id=KEY.owner_id,
            metric=KEY.metric,
        )
        assert series.data_type == DataType.FLOAT
        assert series.key == KEY

    async def test_duplicate_key_raises(self, service: TimeSeriesService):
        await service.create_series(
            data_type=DataType.FLOAT,
            owner_id=KEY.owner_id,
            metric=KEY.metric,
        )
        with pytest.raises(InvalidError, match="already exists"):
            await service.create_series(
                data_type=DataType.FLOAT,
                owner_id=KEY.owner_id,
                metric=KEY.metric,
            )


class TestGetSeries:
    async def test_by_id(self, service: TimeSeriesService):
        created = await service.create_series(
            data_type=DataType.FLOAT,
            owner_id=KEY.owner_id,
            metric=KEY.metric,
        )
        fetched = await service.get_series(created.id)
        assert fetched.id == created.id

    async def test_by_key(self, service: TimeSeriesService):
        created = await service.create_series(
            data_type=DataType.FLOAT,
            owner_id=KEY.owner_id,
            metric=KEY.metric,
        )
        fetched = await service.get_series_by_key(KEY)
        assert fetched is not None
        assert fetched.id == created.id

    async def test_not_found_raises(self, service: TimeSeriesService):
        with pytest.raises(NotFoundError, match="not found"):
            await service.get_series("nonexistent")

    async def test_not_found_by_key(self, service: TimeSeriesService):
        assert await service.get_series_by_key(KEY) is None


class TestListSeries:
    async def test_list_with_filter(self, service: TimeSeriesService):
        await service.create_series(
            data_type=DataType.FLOAT,
            owner_id="s1",
            metric="temperature",
        )
        await service.create_series(
            data_type=DataType.FLOAT,
            owner_id="s1",
            metric="humidity",
        )
        results = await service.list_series(metric="temperature")
        assert len(results) == 1
        assert results[0].metric == "temperature"


class TestRenameMetricForOwners:
    async def test_renames_series_for_each_owner(self, service: TimeSeriesService):
        await service.create_series(
            data_type=DataType.FLOAT, owner_id="d1", metric="temperature"
        )
        await service.create_series(
            data_type=DataType.FLOAT, owner_id="d2", metric="temperature"
        )

        await service.rename_metric_for_owners(["d1", "d2"], "temperature", "temp")

        assert (
            await service.get_series_by_key(
                SeriesKey(owner_id="d1", metric="temperature")
            )
            is None
        )
        assert (
            await service.get_series_by_key(
                SeriesKey(owner_id="d2", metric="temperature")
            )
            is None
        )
        renamed_d1 = await service.get_series_by_key(SeriesKey("d1", "temp"))
        renamed_d2 = await service.get_series_by_key(SeriesKey("d2", "temp"))
        assert renamed_d1 is not None
        assert renamed_d2 is not None

    async def test_preserves_history(self, service: TimeSeriesService):
        now = datetime.now(tz=UTC)
        await service.upsert_points(
            KEY, [DataPoint(timestamp=now, value=21.5)], create_if_not_found=True
        )

        await service.rename_metric_for_owners([KEY.owner_id], KEY.metric, "temp")

        result = await service.fetch_points(SeriesKey(KEY.owner_id, "temp"))
        assert result.points[0].value == 21.5

    async def test_owner_without_series_is_skipped(self, service: TimeSeriesService):
        await service.rename_metric_for_owners(["no-such-owner"], "temperature", "temp")

    async def test_collision_on_one_owner_leaves_no_owner_renamed(
        self, service: TimeSeriesService
    ):
        """A collision anywhere validates first, so nothing is renamed anywhere."""
        await service.create_series(
            data_type=DataType.FLOAT, owner_id="d1", metric="temperature"
        )
        await service.create_series(
            data_type=DataType.FLOAT, owner_id="d2", metric="temperature"
        )
        await service.create_series(
            data_type=DataType.FLOAT, owner_id="d2", metric="temp"
        )

        with pytest.raises(InvalidError, match="already exists"):
            await service.rename_metric_for_owners(["d1", "d2"], "temperature", "temp")

        d1_series = await service.get_series_by_key(
            SeriesKey(owner_id="d1", metric="temperature")
        )
        assert d1_series is not None


class TestUpsertPoints:
    async def test_upsert_and_fetch(self, service: TimeSeriesService):
        await service.create_series(
            data_type=DataType.FLOAT,
            owner_id=KEY.owner_id,
            metric=KEY.metric,
        )
        now = datetime.now(tz=UTC)
        await service.upsert_points(KEY, [DataPoint(timestamp=now, value=23.5)])

        result = await service.fetch_points(KEY)
        assert len(result.points) == 1
        assert result.points[0].value == 23.5

    async def test_validates_value_type(self, service: TimeSeriesService):
        await service.create_series(
            data_type=DataType.FLOAT,
            owner_id=KEY.owner_id,
            metric=KEY.metric,
        )
        now = datetime.now(tz=UTC)
        with pytest.raises(InvalidError, match="Expected float, got str"):
            await service.upsert_points(KEY, [DataPoint(timestamp=now, value="bad")])

    async def test_unknown_key_raises(self, service: TimeSeriesService):
        unknown = SeriesKey(owner_id="y", metric="z")
        with pytest.raises(NotFoundError, match="No series found"):
            await service.upsert_points(unknown, [])

    async def test_create_if_not_found(self, service: TimeSeriesService):
        key = SeriesKey(owner_id="new-owner", metric="temperature")
        now = datetime.now(tz=UTC)
        await service.upsert_points(
            key,
            [DataPoint(timestamp=now, value=42.0)],
            create_if_not_found=True,
        )
        series = await service.get_series_by_key(key)
        assert series is not None
        assert series.data_type == DataType.FLOAT
        result = await service.fetch_points(key)
        assert len(result.points) == 1
        assert result.points[0].value == 42.0

    async def test_create_if_not_found_empty_points_raises(
        self, service: TimeSeriesService
    ):
        key = SeriesKey(owner_id="new-owner", metric="temperature")
        with pytest.raises(InvalidError, match="Cannot infer data_type"):
            await service.upsert_points(key, [], create_if_not_found=True)

    async def test_create_if_not_found_existing_series(
        self, service: TimeSeriesService
    ):
        await service.create_series(
            data_type=DataType.FLOAT,
            owner_id=KEY.owner_id,
            metric=KEY.metric,
        )
        now = datetime.now(tz=UTC)
        await service.upsert_points(
            KEY,
            [DataPoint(timestamp=now, value=10.0)],
            create_if_not_found=True,
        )
        result = await service.fetch_points(KEY)
        assert len(result.points) == 1
        assert result.points[0].value == 10.0

    async def test_naive_timestamp_raises(self, service: TimeSeriesService):
        await service.create_series(
            data_type=DataType.FLOAT,
            owner_id=KEY.owner_id,
            metric=KEY.metric,
        )
        naive = datetime(2026, 1, 1, 10, 0, 0, tzinfo=UTC).replace(tzinfo=None)
        with pytest.raises(InvalidError, match="timezone-aware"):
            await service.upsert_points(KEY, [DataPoint(timestamp=naive, value=1.0)])

    async def test_rejects_bool_as_int(self, service: TimeSeriesService):
        key = SeriesKey(owner_id="d1", metric="count")
        await service.create_series(
            data_type=DataType.INT,
            owner_id=key.owner_id,
            metric=key.metric,
        )
        now = datetime.now(tz=UTC)
        with pytest.raises(InvalidError, match="Expected int, got bool"):
            await service.upsert_points(
                key,
                [DataPoint(timestamp=now, value=True)],
            )


class TestFetchPoints:
    async def test_with_time_range(self, service: TimeSeriesService):
        await service.create_series(
            data_type=DataType.FLOAT,
            owner_id=KEY.owner_id,
            metric=KEY.metric,
        )
        t1 = datetime(2026, 1, 1, tzinfo=UTC)
        t2 = datetime(2026, 1, 2, tzinfo=UTC)
        t3 = datetime(2026, 1, 3, tzinfo=UTC)
        await service.upsert_points(
            KEY,
            [
                DataPoint(timestamp=t1, value=1.0),
                DataPoint(timestamp=t2, value=2.0),
                DataPoint(timestamp=t3, value=3.0),
            ],
        )
        result = await service.fetch_points(KEY, start=t2, end=t2)
        assert len(result.points) == 1
        assert result.points[0].value == 2.0

    async def test_with_last(self, service: TimeSeriesService):
        await service.create_series(
            data_type=DataType.FLOAT,
            owner_id=KEY.owner_id,
            metric=KEY.metric,
        )
        now = datetime.now(tz=UTC)
        old = now - timedelta(hours=5)
        await service.upsert_points(
            KEY,
            [
                DataPoint(timestamp=old, value=1.0),
                DataPoint(timestamp=now, value=2.0),
            ],
        )
        result = await service.fetch_points(KEY, last="3h")
        assert len(result.points) == 1
        assert result.points[0].value == 2.0

    async def test_last_ignored_when_start_is_set(self, service: TimeSeriesService):
        await service.create_series(
            data_type=DataType.FLOAT,
            owner_id=KEY.owner_id,
            metric=KEY.metric,
        )
        t1 = datetime(2026, 1, 1, tzinfo=UTC)
        t2 = datetime(2026, 1, 2, tzinfo=UTC)
        await service.upsert_points(
            KEY,
            [
                DataPoint(timestamp=t1, value=1.0),
                DataPoint(timestamp=t2, value=2.0),
            ],
        )
        # explicit start should take precedence over last
        result = await service.fetch_points(KEY, start=t1, last="1h")
        assert len(result.points) == 2

    async def test_carry_forward(self, service: TimeSeriesService):
        await service.create_series(
            data_type=DataType.FLOAT,
            owner_id=KEY.owner_id,
            metric=KEY.metric,
        )
        t1 = datetime(2026, 1, 1, tzinfo=UTC)
        t2 = datetime(2026, 1, 3, tzinfo=UTC)
        t3 = datetime(2026, 1, 4, tzinfo=UTC)
        await service.upsert_points(
            KEY,
            [
                DataPoint(timestamp=t1, value=1.0),
                DataPoint(timestamp=t3, value=3.0),
            ],
        )
        result = await service.fetch_points(KEY, start=t2, carry_forward=True)
        assert len(result.points) == 2
        assert result.points[0].timestamp == t2
        assert result.points[0].value == 1.0
        assert result.points[1].timestamp == t3
        assert result.points[1].value == 3.0

    async def test_carry_forward_no_previous_exists(self, service: TimeSeriesService):
        await service.create_series(
            data_type=DataType.FLOAT,
            owner_id=KEY.owner_id,
            metric=KEY.metric,
        )
        t1 = datetime(2026, 1, 2, tzinfo=UTC)
        t2 = datetime(2026, 1, 3, tzinfo=UTC)
        await service.upsert_points(
            KEY,
            [
                DataPoint(timestamp=t1, value=1.0),
                DataPoint(timestamp=t2, value=2.0),
            ],
        )
        result = await service.fetch_points(KEY, start=t1, carry_forward=True)
        assert len(result.points) == 2
        assert result.points[0].value == 1.0
        assert result.points[1].value == 2.0

    async def test_carry_forward_noop_without_start(self, service: TimeSeriesService):
        await service.create_series(
            data_type=DataType.FLOAT,
            owner_id=KEY.owner_id,
            metric=KEY.metric,
        )
        now = datetime.now(tz=UTC)
        await service.upsert_points(KEY, [DataPoint(timestamp=now, value=1.0)])
        result = await service.fetch_points(KEY, carry_forward=True)
        assert len(result.points) == 1
        assert result.points[0].value == 1.0

    async def test_carry_forward_with_last(self, service: TimeSeriesService):
        await service.create_series(
            data_type=DataType.FLOAT,
            owner_id=KEY.owner_id,
            metric=KEY.metric,
        )
        now = datetime.now(tz=UTC)
        old = now - timedelta(hours=5)
        await service.upsert_points(
            KEY,
            [
                DataPoint(timestamp=old, value=1.0),
                DataPoint(timestamp=now, value=2.0),
            ],
        )
        result = await service.fetch_points(KEY, last="3h", carry_forward=True)
        assert len(result.points) == 2
        assert result.points[0].value == 1.0
        assert result.points[1].value == 2.0

    async def test_empty_result(self, service: TimeSeriesService):
        result = await service.fetch_points(KEY)
        assert isinstance(result, FetchPointsResult)
        assert result.points == []
        assert result.truncated is False
        assert result.next_start is None

    @pytest.mark.parametrize(
        ("naive_local", "tz", "t_inside_utc", "t_outside_utc"),
        [
            # Paris CET (UTC+1): naive 01:00 → 00:00 UTC
            (
                datetime(2026, 1, 16, 1, 0, 0, tzinfo=UTC).replace(tzinfo=None),
                "Europe/Paris",
                datetime(2026, 1, 16, 0, 1, 0, tzinfo=UTC),
                datetime(2026, 1, 15, 23, 59, 0, tzinfo=UTC),
            ),
            # Paris CEST (UTC+2): naive 01:00 → 23:00 UTC prev day
            (
                datetime(2026, 7, 16, 1, 0, 0, tzinfo=UTC).replace(tzinfo=None),
                "Europe/Paris",
                datetime(2026, 7, 15, 23, 1, 0, tzinfo=UTC),
                datetime(2026, 7, 15, 22, 59, 0, tzinfo=UTC),
            ),
        ],
    )
    async def test_naive_start_normalized_by_service_tz(
        self,
        naive_local: datetime,
        tz: str,
        t_inside_utc: datetime,
        t_outside_utc: datetime,
    ):
        svc = TimeSeriesService(storage_url=None, default_timezone=tz)
        await svc.start()
        try:
            await svc.create_series(
                data_type=DataType.FLOAT,
                owner_id=KEY.owner_id,
                metric=KEY.metric,
            )
            await svc.upsert_points(
                KEY,
                [
                    DataPoint(timestamp=t_outside_utc, value=1.0),
                    DataPoint(timestamp=t_inside_utc, value=2.0),
                ],
            )
            result = await svc.fetch_points(KEY, start=naive_local)
            assert len(result.points) == 1
            assert result.points[0].value == 2.0
        finally:
            await svc.stop()


class TestFetchPointsTruncation:
    async def _setup(self, service: TimeSeriesService, n: int) -> list[DataPoint]:
        await service.create_series(
            data_type=DataType.FLOAT,
            owner_id=KEY.owner_id,
            metric=KEY.metric,
        )
        base = datetime(2026, 1, 1, tzinfo=UTC)
        points = [
            DataPoint(timestamp=base + timedelta(minutes=i), value=float(i))
            for i in range(n)
        ]
        await service.upsert_points(KEY, points)
        return points

    async def test_truncated_true_when_more_points_than_limit(
        self, service: TimeSeriesService
    ):
        pts = await self._setup(service, 5)
        result = await service.fetch_points(KEY, limit=3)
        assert result.truncated is True
        assert len(result.points) == 3
        assert result.next_start == pts[3].timestamp

    async def test_truncated_false_when_fewer_points_than_limit(
        self, service: TimeSeriesService
    ):
        await self._setup(service, 3)
        result = await service.fetch_points(KEY, limit=10)
        assert result.truncated is False
        assert result.next_start is None
        assert len(result.points) == 3

    @pytest.mark.parametrize("bad_limit", [MAX_RAW_LIMIT + 1, 0, -1, -100])
    async def test_invalid_limit_raises_invalid_error(
        self, service: TimeSeriesService, bad_limit: int
    ):
        with pytest.raises(InvalidError, match="limit must be between"):
            await service.fetch_points(KEY, limit=bad_limit)

    async def test_cursor_pagination_no_overlap_no_gap(
        self, service: TimeSeriesService
    ):
        pts = await self._setup(service, 5)
        page1 = await service.fetch_points(KEY, limit=3)
        assert page1.truncated is True
        assert page1.next_start is not None

        page2 = await service.fetch_points(KEY, start=page1.next_start, limit=3)
        all_values = [p.value for p in page1.points] + [p.value for p in page2.points]
        expected = [p.value for p in pts]
        assert all_values == expected

    async def test_carry_forward_with_truncation_respects_limit(
        self, service: TimeSeriesService
    ):
        pts = await self._setup(service, 5)
        old = pts[0].timestamp - timedelta(hours=1)
        await service.upsert_points(KEY, [DataPoint(timestamp=old, value=99.0)])

        result = await service.fetch_points(
            KEY, start=pts[0].timestamp, carry_forward=True, limit=3
        )
        assert len(result.points) == 3
        assert result.truncated is True
        assert result.points[0].value == 99.0
        assert result.next_start == pts[2].timestamp
