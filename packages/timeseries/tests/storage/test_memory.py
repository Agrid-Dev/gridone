from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from conftest import make_command  # type: ignore[import-not-found]
from models.errors import InvalidError, NotFoundError
from timeseries.domain import (
    CommandStatus,
    DataPoint,
    DataType,
    DeviceCommandCreate,
    SeriesKey,
    SortOrder,
    TimeSeries,
)
from timeseries.domain.filters import CommandsQueryFilters
from timeseries.storage import MemoryStorage

KEY = SeriesKey(owner_id="s1", metric="temperature")


@pytest.fixture
def storage() -> MemoryStorage:
    return MemoryStorage()


def _make_series(
    key: SeriesKey = KEY,
    data_type: DataType = DataType.FLOAT,
) -> TimeSeries:
    return TimeSeries(
        data_type=data_type,
        owner_id=key.owner_id,
        metric=key.metric,
    )


pytestmark = pytest.mark.asyncio


class TestCreateSeries:
    async def test_create_and_get(self, storage: MemoryStorage):
        series = _make_series()
        created = await storage.create_series(series)
        assert created.id == series.id

        fetched = await storage.get_series(created.id)
        assert fetched is not None
        assert fetched.id == created.id

    async def test_returns_copy(self, storage: MemoryStorage):
        series = _make_series()
        created = await storage.create_series(series)
        assert created is not series

    async def test_duplicate_id_raises(self, storage: MemoryStorage):
        series = _make_series()
        await storage.create_series(series)
        with pytest.raises(InvalidError, match="already exists"):
            await storage.create_series(series)

    async def test_duplicate_key_raises(self, storage: MemoryStorage):
        await storage.create_series(_make_series())
        second = _make_series()  # same key, different id
        with pytest.raises(InvalidError, match="already exists"):
            await storage.create_series(second)


class TestGetSeries:
    async def test_not_found(self, storage: MemoryStorage):
        assert await storage.get_series("nonexistent") is None

    async def test_by_key(self, storage: MemoryStorage):
        series = _make_series()
        await storage.create_series(series)
        fetched = await storage.get_series_by_key(KEY)
        assert fetched is not None
        assert fetched.id == series.id

    async def test_by_key_not_found(self, storage: MemoryStorage):
        other = SeriesKey(owner_id="y", metric="z")
        assert await storage.get_series_by_key(other) is None


class TestListSeries:
    async def test_empty(self, storage: MemoryStorage):
        assert await storage.list_series() == []

    async def test_no_filter(self, storage: MemoryStorage):
        await storage.create_series(_make_series(KEY))
        key2 = SeriesKey(owner_id="s2", metric="humidity")
        await storage.create_series(_make_series(key2))
        assert len(await storage.list_series()) == 2

    async def test_filter_owner_id(self, storage: MemoryStorage):
        await storage.create_series(_make_series(KEY))
        key2 = SeriesKey(owner_id="s2", metric="humidity")
        await storage.create_series(_make_series(key2))
        results = await storage.list_series(owner_id="s1")
        assert len(results) == 1

    async def test_filter_metric(self, storage: MemoryStorage):
        await storage.create_series(_make_series(KEY))
        key2 = SeriesKey(owner_id="s1", metric="humidity")
        await storage.create_series(_make_series(key2))
        results = await storage.list_series(metric="humidity")
        assert len(results) == 1

    async def test_combined_filters(self, storage: MemoryStorage):
        await storage.create_series(_make_series(KEY))
        key2 = SeriesKey(owner_id="s1", metric="humidity")
        await storage.create_series(_make_series(key2))
        results = await storage.list_series(owner_id="s1", metric="temperature")
        assert len(results) == 1


class TestUpsertPoints:
    async def test_insert(self, storage: MemoryStorage):
        await storage.create_series(_make_series())
        now = datetime.now(tz=UTC)
        points = [DataPoint(timestamp=now, value=23.5)]
        await storage.upsert_points(KEY, points)

        fetched = await storage.fetch_points(KEY)
        assert len(fetched) == 1
        assert fetched[0].value == 23.5

    async def test_upsert_overwrites_same_timestamp(self, storage: MemoryStorage):
        await storage.create_series(_make_series())
        now = datetime.now(tz=UTC)
        await storage.upsert_points(KEY, [DataPoint(timestamp=now, value=1.0)])
        await storage.upsert_points(KEY, [DataPoint(timestamp=now, value=2.0)])

        fetched = await storage.fetch_points(KEY)
        assert len(fetched) == 1
        assert fetched[0].value == 2.0

    async def test_points_sorted_by_timestamp(self, storage: MemoryStorage):
        await storage.create_series(_make_series())
        t1 = datetime(2026, 1, 1, tzinfo=UTC)
        t2 = datetime(2026, 1, 2, tzinfo=UTC)
        t3 = datetime(2026, 1, 3, tzinfo=UTC)
        await storage.upsert_points(
            KEY,
            [
                DataPoint(timestamp=t3, value=3.0),
                DataPoint(timestamp=t1, value=1.0),
                DataPoint(timestamp=t2, value=2.0),
            ],
        )
        fetched = await storage.fetch_points(KEY)
        assert [p.value for p in fetched] == [1.0, 2.0, 3.0]

    async def test_updates_updated_at(self, storage: MemoryStorage):
        series = _make_series()
        created = await storage.create_series(series)
        original_updated = created.updated_at

        now = datetime.now(tz=UTC)
        await storage.upsert_points(KEY, [DataPoint(timestamp=now, value=1.0)])

        fetched = await storage.get_series_by_key(KEY)
        assert fetched is not None
        assert fetched.updated_at >= original_updated

    async def test_unknown_key_raises(self, storage: MemoryStorage):
        unknown = SeriesKey(owner_id="y", metric="z")
        with pytest.raises(NotFoundError, match="No series found"):
            await storage.upsert_points(unknown, [])

    async def test_command_id_stored_and_fetched(self, storage: MemoryStorage):
        await storage.create_series(_make_series())
        now = datetime.now(tz=UTC)
        point = DataPoint(timestamp=now, value=1.0, command_id=7)
        await storage.upsert_points(KEY, [point])
        fetched = await storage.fetch_points(KEY)
        assert fetched[0].command_id == 7

    async def test_coalesce_preserves_command_id_when_absent(
        self, storage: MemoryStorage
    ):
        await storage.create_series(_make_series())
        now = datetime.now(tz=UTC)
        await storage.upsert_points(
            KEY, [DataPoint(timestamp=now, value=1.0, command_id=5)]
        )
        await storage.upsert_points(KEY, [DataPoint(timestamp=now, value=1.0)])
        fetched = await storage.fetch_points(KEY)
        assert fetched[0].command_id == 5

    async def test_command_id_overwritten_when_provided(self, storage: MemoryStorage):
        await storage.create_series(_make_series())
        now = datetime.now(tz=UTC)
        await storage.upsert_points(
            KEY, [DataPoint(timestamp=now, value=1.0, command_id=5)]
        )
        await storage.upsert_points(
            KEY, [DataPoint(timestamp=now, value=1.0, command_id=10)]
        )
        fetched = await storage.fetch_points(KEY)
        assert fetched[0].command_id == 10


class TestFetchPointBefore:
    async def test_returns_most_recent_point_before(self, storage: MemoryStorage):
        await storage.create_series(_make_series())
        t1 = datetime(2026, 1, 1, tzinfo=UTC)
        t2 = datetime(2026, 1, 2, tzinfo=UTC)
        t3 = datetime(2026, 1, 3, tzinfo=UTC)
        await storage.upsert_points(
            KEY,
            [
                DataPoint(timestamp=t1, value=1.0),
                DataPoint(timestamp=t2, value=2.0),
                DataPoint(timestamp=t3, value=3.0),
            ],
        )
        result = await storage.fetch_point_before(KEY, before=t3)
        assert result is not None
        assert result.timestamp == t2
        assert result.value == 2.0

    async def test_no_point_before_returns_none(self, storage: MemoryStorage):
        await storage.create_series(_make_series())
        t1 = datetime(2026, 1, 2, tzinfo=UTC)
        t2 = datetime(2026, 1, 3, tzinfo=UTC)
        await storage.upsert_points(
            KEY,
            [
                DataPoint(timestamp=t1, value=1.0),
                DataPoint(timestamp=t2, value=2.0),
            ],
        )
        result = await storage.fetch_point_before(KEY, before=t1)
        assert result is None

    async def test_point_at_boundary_excluded(self, storage: MemoryStorage):
        await storage.create_series(_make_series())
        t1 = datetime(2026, 1, 1, tzinfo=UTC)
        await storage.upsert_points(KEY, [DataPoint(timestamp=t1, value=1.0)])
        result = await storage.fetch_point_before(KEY, before=t1)
        assert result is None

    async def test_unknown_key_returns_none(self, storage: MemoryStorage):
        unknown = SeriesKey(owner_id="y", metric="z")
        result = await storage.fetch_point_before(unknown, before=datetime.now(tz=UTC))
        assert result is None


class TestFetchPoints:
    async def test_empty_series(self, storage: MemoryStorage):
        await storage.create_series(_make_series())
        assert await storage.fetch_points(KEY) == []

    async def test_unknown_key_returns_empty(self, storage: MemoryStorage):
        unknown = SeriesKey(owner_id="y", metric="z")
        assert await storage.fetch_points(unknown) == []

    async def test_filter_start(self, storage: MemoryStorage):
        await storage.create_series(_make_series())
        t1 = datetime(2026, 1, 1, tzinfo=UTC)
        t2 = datetime(2026, 1, 2, tzinfo=UTC)
        t3 = datetime(2026, 1, 3, tzinfo=UTC)
        await storage.upsert_points(
            KEY,
            [
                DataPoint(timestamp=t1, value=1.0),
                DataPoint(timestamp=t2, value=2.0),
                DataPoint(timestamp=t3, value=3.0),
            ],
        )
        fetched = await storage.fetch_points(KEY, start=t2)
        assert [p.value for p in fetched] == [2.0, 3.0]

    async def test_filter_end(self, storage: MemoryStorage):
        await storage.create_series(_make_series())
        t1 = datetime(2026, 1, 1, tzinfo=UTC)
        t2 = datetime(2026, 1, 2, tzinfo=UTC)
        t3 = datetime(2026, 1, 3, tzinfo=UTC)
        await storage.upsert_points(
            KEY,
            [
                DataPoint(timestamp=t1, value=1.0),
                DataPoint(timestamp=t2, value=2.0),
                DataPoint(timestamp=t3, value=3.0),
            ],
        )
        fetched = await storage.fetch_points(KEY, end=t2)
        assert [p.value for p in fetched] == [1.0, 2.0]

    async def test_filter_range(self, storage: MemoryStorage):
        await storage.create_series(_make_series())
        base = datetime(2026, 1, 1, tzinfo=UTC)
        points = [
            DataPoint(timestamp=base + timedelta(days=i), value=float(i))
            for i in range(5)
        ]
        await storage.upsert_points(KEY, points)
        fetched = await storage.fetch_points(
            KEY,
            start=base + timedelta(days=1),
            end=base + timedelta(days=3),
        )
        assert [p.value for p in fetched] == [1.0, 2.0, 3.0]


class TestSaveDeviceCommand:
    async def test_adds_command(self, storage: MemoryStorage):
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
        command = await storage.save_command(command_create)
        assert command.id is not None
        assert command.device_id == command_create.device_id


class TestQueryCommands:
    async def test_empty(self, storage: MemoryStorage):
        results = await storage.query_commands(CommandsQueryFilters())
        assert results == []

    async def test_no_filters_returns_all(self, storage: MemoryStorage):
        await storage.save_command(make_command(device_id="d1"))
        await storage.save_command(make_command(device_id="d2"))
        results = await storage.query_commands(CommandsQueryFilters())
        assert len(results) == 2

    async def test_filter_device_id(self, storage: MemoryStorage):
        await storage.save_command(make_command(device_id="d1"))
        await storage.save_command(make_command(device_id="d2"))
        results = await storage.query_commands(
            CommandsQueryFilters(device_id="d1"),
        )
        assert len(results) == 1
        assert results[0].device_id == "d1"

    async def test_filter_attribute(self, storage: MemoryStorage):
        await storage.save_command(make_command(attribute="mode"))
        await storage.save_command(make_command(attribute="setpoint"))
        results = await storage.query_commands(
            CommandsQueryFilters(attribute="setpoint"),
        )
        assert len(results) == 1
        assert results[0].attribute == "setpoint"

    async def test_filter_user_id(self, storage: MemoryStorage):
        await storage.save_command(make_command(user_id="u1"))
        await storage.save_command(make_command(user_id="u2"))
        results = await storage.query_commands(
            CommandsQueryFilters(user_id="u1"),
        )
        assert len(results) == 1
        assert results[0].user_id == "u1"

    async def test_filter_start(self, storage: MemoryStorage):
        t1 = datetime(2026, 1, 1, tzinfo=UTC)
        t2 = datetime(2026, 1, 2, tzinfo=UTC)
        t3 = datetime(2026, 1, 3, tzinfo=UTC)
        await storage.save_command(make_command(timestamp=t1))
        await storage.save_command(make_command(timestamp=t2))
        await storage.save_command(make_command(timestamp=t3))
        results = await storage.query_commands(
            CommandsQueryFilters(start=t2),
        )
        assert len(results) == 2

    async def test_filter_end(self, storage: MemoryStorage):
        t1 = datetime(2026, 1, 1, tzinfo=UTC)
        t2 = datetime(2026, 1, 2, tzinfo=UTC)
        t3 = datetime(2026, 1, 3, tzinfo=UTC)
        await storage.save_command(make_command(timestamp=t1))
        await storage.save_command(make_command(timestamp=t2))
        await storage.save_command(make_command(timestamp=t3))
        results = await storage.query_commands(
            CommandsQueryFilters(end=t2),
        )
        assert len(results) == 1

    async def test_combined_filters(self, storage: MemoryStorage):
        t1 = datetime(2026, 1, 1, tzinfo=UTC)
        t2 = datetime(2026, 1, 2, tzinfo=UTC)
        await storage.save_command(
            make_command(device_id="d1", user_id="u1", timestamp=t1),
        )
        await storage.save_command(
            make_command(device_id="d1", user_id="u2", timestamp=t2),
        )
        await storage.save_command(
            make_command(device_id="d2", user_id="u1", timestamp=t2),
        )
        results = await storage.query_commands(
            CommandsQueryFilters(device_id="d1", user_id="u1"),
        )
        assert len(results) == 1
        assert results[0].device_id == "d1"
        assert results[0].user_id == "u1"

    async def test_limit(self, storage: MemoryStorage):
        for i in range(5):
            await storage.save_command(make_command(device_id=f"d{i}"))
        results = await storage.query_commands(CommandsQueryFilters(), limit=3)
        assert len(results) == 3

    async def test_offset(self, storage: MemoryStorage):
        for i in range(5):
            await storage.save_command(make_command(device_id=f"d{i}"))
        results = await storage.query_commands(CommandsQueryFilters(), offset=2)
        assert len(results) == 3
        assert results[0].device_id == "d2"

    async def test_limit_and_offset(self, storage: MemoryStorage):
        for i in range(5):
            await storage.save_command(make_command(device_id=f"d{i}"))
        results = await storage.query_commands(
            CommandsQueryFilters(), limit=2, offset=1
        )
        assert len(results) == 2
        assert results[0].device_id == "d1"
        assert results[1].device_id == "d2"

    async def test_sort_asc(self, storage: MemoryStorage):
        t1 = datetime(2026, 1, 1, tzinfo=UTC)
        t2 = datetime(2026, 1, 2, tzinfo=UTC)
        t3 = datetime(2026, 1, 3, tzinfo=UTC)
        await storage.save_command(make_command(timestamp=t1))
        await storage.save_command(make_command(timestamp=t2))
        await storage.save_command(make_command(timestamp=t3))
        results = await storage.query_commands(
            CommandsQueryFilters(), sort=SortOrder.ASC
        )
        assert [r.timestamp for r in results] == [t1, t2, t3]

    async def test_sort_desc(self, storage: MemoryStorage):
        t1 = datetime(2026, 1, 1, tzinfo=UTC)
        t2 = datetime(2026, 1, 2, tzinfo=UTC)
        t3 = datetime(2026, 1, 3, tzinfo=UTC)
        await storage.save_command(make_command(timestamp=t1))
        await storage.save_command(make_command(timestamp=t2))
        await storage.save_command(make_command(timestamp=t3))
        results = await storage.query_commands(
            CommandsQueryFilters(), sort=SortOrder.DESC
        )
        assert [r.timestamp for r in results] == [t3, t2, t1]


class TestCountCommands:
    async def test_count_empty(self, storage: MemoryStorage):
        count = await storage.count_commands(CommandsQueryFilters())
        assert count == 0

    async def test_count_all(self, storage: MemoryStorage):
        await storage.save_command(make_command(device_id="d1"))
        await storage.save_command(make_command(device_id="d2"))
        count = await storage.count_commands(CommandsQueryFilters())
        assert count == 2

    async def test_count_with_filters(self, storage: MemoryStorage):
        await storage.save_command(make_command(device_id="d1"))
        await storage.save_command(make_command(device_id="d2"))
        await storage.save_command(make_command(device_id="d1"))
        count = await storage.count_commands(CommandsQueryFilters(device_id="d1"))
        assert count == 2
