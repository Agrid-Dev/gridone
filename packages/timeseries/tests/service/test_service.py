from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from conftest import make_command  # type: ignore[import-not-found]
from models.errors import InvalidError, NotFoundError
from models.pagination import PaginationParams
from timeseries.domain import (
    CommandStatus,
    DataPoint,
    DataType,
    DeviceCommandCreate,
    SeriesKey,
    SortOrder,
)
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
        points = await service.fetch_points(KEY, start=t2, end=t2)
        assert len(points) == 1
        assert points[0].value == 2.0

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
        points = await service.fetch_points(KEY, last="3h")
        assert len(points) == 1
        assert points[0].value == 2.0

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
        points = await service.fetch_points(KEY, start=t1, last="1h")
        assert len(points) == 2

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
        points = await service.fetch_points(KEY, start=t2, carry_forward=True)
        assert len(points) == 2
        assert points[0].timestamp == t2
        assert points[0].value == 1.0
        assert points[1].timestamp == t3
        assert points[1].value == 3.0

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
        points = await service.fetch_points(KEY, start=t1, carry_forward=True)
        assert len(points) == 2
        assert points[0].value == 1.0
        assert points[1].value == 2.0

    async def test_carry_forward_noop_without_start(self, service: TimeSeriesService):
        await service.create_series(
            data_type=DataType.FLOAT,
            owner_id=KEY.owner_id,
            metric=KEY.metric,
        )
        now = datetime.now(tz=UTC)
        await service.upsert_points(KEY, [DataPoint(timestamp=now, value=1.0)])
        points = await service.fetch_points(KEY, carry_forward=True)
        assert len(points) == 1
        assert points[0].value == 1.0

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
        points = await service.fetch_points(KEY, last="3h", carry_forward=True)
        assert len(points) == 2
        assert points[0].value == 1.0
        assert points[1].value == 2.0

    async def test_empty_result(self, service: TimeSeriesService):
        points = await service.fetch_points(KEY)
        assert points == []


class TestLogCommand:
    async def test_log_command(self, service: TimeSeriesService):
        command_create = DeviceCommandCreate(
            device_id="device1",
            attribute="mode",
            user_id="user1",
            value="auto",
            data_type=DataType.STRING,
            status=CommandStatus.SUCCESS,
            timestamp=datetime.now(tz=UTC),
            status_details=None,
        )
        command = await service.log_command(command_create)
        assert command.id is not None
        assert command.device_id == "device1"
        assert command.attribute == "mode"
        assert command.value == "auto"


class TestGetCommands:
    async def test_empty(self, service: TimeSeriesService):
        page = await service.get_commands()
        assert page.items == []
        assert page.total == 0

    async def test_no_filters_returns_all(self, service: TimeSeriesService):
        await service.log_command(make_command(device_id="d1"))
        await service.log_command(make_command(device_id="d2"))
        page = await service.get_commands()
        assert len(page.items) == 2
        assert page.total == 2

    async def test_filter_device_id(self, service: TimeSeriesService):
        await service.log_command(make_command(device_id="d1"))
        await service.log_command(make_command(device_id="d2"))
        page = await service.get_commands(device_id="d1")
        assert len(page.items) == 1
        assert page.items[0].device_id == "d1"

    async def test_filter_with_last(self, service: TimeSeriesService):
        now = datetime.now(tz=UTC)
        old = now - timedelta(hours=5)
        await service.log_command(make_command(timestamp=old))
        await service.log_command(make_command(timestamp=now))
        page = await service.get_commands(last="3h")
        assert len(page.items) == 1

    async def test_last_ignored_when_start_is_set(self, service: TimeSeriesService):
        t1 = datetime(2026, 1, 1, tzinfo=UTC)
        t2 = datetime(2026, 1, 2, tzinfo=UTC)
        await service.log_command(make_command(timestamp=t1))
        await service.log_command(make_command(timestamp=t2))
        page = await service.get_commands(start=t1, last="1s")
        assert len(page.items) == 2

    async def test_combined_filters(self, service: TimeSeriesService):
        t1 = datetime(2026, 1, 1, tzinfo=UTC)
        t2 = datetime(2026, 1, 2, tzinfo=UTC)
        await service.log_command(
            make_command(device_id="d1", user_id="u1", timestamp=t1),
        )
        await service.log_command(
            make_command(device_id="d1", user_id="u2", timestamp=t2),
        )
        await service.log_command(
            make_command(device_id="d2", user_id="u1", timestamp=t2),
        )
        page = await service.get_commands(device_id="d1", user_id="u1")
        assert len(page.items) == 1
        assert page.items[0].device_id == "d1"
        assert page.items[0].user_id == "u1"

    async def test_end_before_start_raises(self, service: TimeSeriesService):
        with pytest.raises(ValueError, match="start must be before end"):
            await service.get_commands(
                start=datetime(2026, 1, 2, tzinfo=UTC),
                end=datetime(2026, 1, 1, tzinfo=UTC),
            )

    async def test_pagination_page_1(self, service: TimeSeriesService):
        for i in range(5):
            await service.log_command(make_command(device_id=f"d{i}"))
        page = await service.get_commands(pagination=PaginationParams(page=1, size=2))
        assert len(page.items) == 2
        assert page.total == 5
        assert page.page == 1
        assert page.size == 2
        assert page.has_next is True

    async def test_pagination_page_2(self, service: TimeSeriesService):
        for i in range(5):
            await service.log_command(make_command(device_id=f"d{i}"))
        page = await service.get_commands(pagination=PaginationParams(page=2, size=2))
        assert len(page.items) == 2
        assert page.items[0].device_id == "d2"
        assert page.page == 2
        assert page.has_prev is True

    async def test_pagination_no_params_returns_all(self, service: TimeSeriesService):
        for i in range(3):
            await service.log_command(make_command(device_id=f"d{i}"))
        page = await service.get_commands()
        assert len(page.items) == 3
        assert page.total == 3
        assert page.page == 1

    async def test_sort_desc(self, service: TimeSeriesService):
        t1 = datetime(2026, 1, 1, tzinfo=UTC)
        t2 = datetime(2026, 1, 2, tzinfo=UTC)
        t3 = datetime(2026, 1, 3, tzinfo=UTC)
        await service.log_command(make_command(timestamp=t1))
        await service.log_command(make_command(timestamp=t2))
        await service.log_command(make_command(timestamp=t3))
        page = await service.get_commands(sort=SortOrder.DESC)
        assert [c.timestamp for c in page.items] == [t3, t2, t1]

    async def test_ids_returns_matching(self, service: TimeSeriesService):
        cmd1 = await service.log_command(make_command(device_id="d1"))
        await service.log_command(make_command(device_id="d2"))
        cmd3 = await service.log_command(make_command(device_id="d3"))
        page = await service.get_commands(ids=[cmd1.id, cmd3.id])
        assert {c.id for c in page.items} == {cmd1.id, cmd3.id}
        assert page.total == 2

    async def test_ids_empty_returns_empty(self, service: TimeSeriesService):
        page = await service.get_commands(ids=[])
        assert page.items == []
        assert page.total == 0

    async def test_ids_missing_are_ignored(self, service: TimeSeriesService):
        cmd = await service.log_command(make_command(device_id="d1"))
        page = await service.get_commands(ids=[cmd.id, 9999])
        assert len(page.items) == 1
        assert page.items[0].id == cmd.id

    async def test_ids_with_other_filters_raises(self, service: TimeSeriesService):
        with pytest.raises(InvalidError, match="Cannot combine"):
            await service.get_commands(ids=[1], device_id="d1")
