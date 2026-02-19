from __future__ import annotations

from datetime import UTC, datetime

import pytest
from models.errors import InvalidError, NotFoundError
from timeseries.domain import DataPoint, DataType, SeriesKey
from timeseries.service import TimeSeriesService
from timeseries.storage import MemoryStorage

pytestmark = pytest.mark.asyncio

KEY = SeriesKey(owner_id="s1", metric="temperature")


@pytest.fixture
def service() -> TimeSeriesService:
    return TimeSeriesService(storage=MemoryStorage())


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
        assert fetched is not None
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

    async def test_not_found(self, service: TimeSeriesService):
        assert await service.get_series("nonexistent") is None
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


class TestUpsertPoints:
    async def test_upsert_and_fetch(self, service: TimeSeriesService):
        await service.create_series(
            data_type=DataType.FLOAT,
            owner_id=KEY.owner_id,
            metric=KEY.metric,
        )
        now = datetime.now(tz=UTC)
        await service.upsert_points(KEY, [DataPoint(timestamp=now, value=23.5)])

        points = await service.fetch_points(KEY)
        assert len(points) == 1
        assert points[0].value == 23.5

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
        points = await service.fetch_points(key)
        assert len(points) == 1
        assert points[0].value == 42.0

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
        points = await service.fetch_points(KEY)
        assert len(points) == 1
        assert points[0].value == 10.0

    async def test_rejects_bool_as_int(self, service: TimeSeriesService):
        key = SeriesKey(owner_id="d1", metric="count")
        await service.create_series(
            data_type=DataType.INTEGER,
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
        points = await service.fetch_points(KEY, start=t2, end=t2)
        assert len(points) == 1
        assert points[0].value == 2.0

    async def test_empty_result(self, service: TimeSeriesService):
        points = await service.fetch_points(KEY)
        assert points == []
