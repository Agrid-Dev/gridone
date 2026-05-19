from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

import pytest
import pytest_asyncio

from models.errors import InvalidError
from timeseries.domain import DataPoint, DataType, SeriesKey
from timeseries.service import TimeSeriesService

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

pytestmark = pytest.mark.asyncio

DEVICE_ID = "vd-ts-int"
TEMPERATURE = "temperature"
SETPOINT = "setpoint"


@pytest_asyncio.fixture
async def service() -> AsyncIterator[TimeSeriesService]:
    service = TimeSeriesService(storage_url=None)
    await service.start()
    yield service
    await service.stop()


def _ts(hour: int) -> datetime:
    return datetime(2026, 1, 15, hour, 0, 0, tzinfo=UTC)


class TestHistoryPush:
    async def test_pushed_points_are_fetchable(self, service: TimeSeriesService):
        key = SeriesKey(owner_id=DEVICE_ID, metric=TEMPERATURE)
        points = [
            DataPoint(timestamp=_ts(10), value=20.5),
            DataPoint(timestamp=_ts(11), value=21.0),
        ]
        await service.upsert_points(key, points, create_if_not_found=True)

        result = await service.fetch_points(key)
        assert len(result.points) == 2
        assert {p.value for p in result.points} == {20.5, 21.0}

    async def test_points_have_no_command_id(self, service: TimeSeriesService):
        """History push must not attach a command_id to stored points."""
        key = SeriesKey(owner_id=DEVICE_ID, metric=TEMPERATURE)
        await service.upsert_points(
            key,
            [DataPoint(timestamp=_ts(10), value=19.0)],
            create_if_not_found=True,
        )
        result = await service.fetch_points(key)
        assert all(p.command_id is None for p in result.points)

    async def test_series_created_on_first_push(self, service: TimeSeriesService):
        """create_if_not_found=True must auto-create the series."""
        key = SeriesKey(owner_id=DEVICE_ID, metric=SETPOINT)
        assert await service.get_series_by_key(key) is None

        await service.upsert_points(
            key,
            [DataPoint(timestamp=_ts(10), value=22.0)],
            create_if_not_found=True,
        )
        series = await service.get_series_by_key(key)
        assert series is not None
        assert series.data_type == DataType.FLOAT

    async def test_multiple_attributes_stored_independently(
        self, service: TimeSeriesService
    ):
        """Points for different metrics must not cross-contaminate."""
        temp_key = SeriesKey(owner_id=DEVICE_ID, metric=TEMPERATURE)
        setpoint_key = SeriesKey(owner_id=DEVICE_ID, metric=SETPOINT)

        await service.upsert_points(
            temp_key,
            [
                DataPoint(timestamp=_ts(10), value=20.0),
                DataPoint(timestamp=_ts(11), value=21.0),
            ],
            create_if_not_found=True,
        )
        await service.upsert_points(
            setpoint_key,
            [DataPoint(timestamp=_ts(10), value=22.0)],
            create_if_not_found=True,
        )

        temp_result = await service.fetch_points(temp_key)
        setpoint_result = await service.fetch_points(setpoint_key)

        assert len(temp_result.points) == 2
        assert len(setpoint_result.points) == 1
        assert setpoint_result.points[0].value == 22.0

    async def test_repeated_push_upserts_existing_series(
        self, service: TimeSeriesService
    ):
        """Pushing twice to the same series appends points."""
        key = SeriesKey(owner_id=DEVICE_ID, metric=TEMPERATURE)
        await service.upsert_points(
            key, [DataPoint(timestamp=_ts(10), value=20.0)], create_if_not_found=True
        )
        await service.upsert_points(
            key, [DataPoint(timestamp=_ts(11), value=21.0)], create_if_not_found=True
        )
        result = await service.fetch_points(key)
        assert len(result.points) == 2

    async def test_validate_data_type_creates_series_with_correct_type(
        self, service: TimeSeriesService
    ):
        """validate_data_type is used as the series data_type when creating."""
        key = SeriesKey(owner_id=DEVICE_ID, metric=SETPOINT)
        await service.upsert_points(
            key,
            [DataPoint(timestamp=_ts(10), value=22.0)],
            create_if_not_found=True,
            validate_data_type=DataType.FLOAT,
        )
        series = await service.get_series_by_key(key)
        assert series is not None
        assert series.data_type == DataType.FLOAT

    async def test_validate_data_type_rejects_wrong_type(
        self, service: TimeSeriesService
    ):
        """validate_data_type causes InvalidError when value type mismatches."""
        key = SeriesKey(owner_id=DEVICE_ID, metric=TEMPERATURE)
        with pytest.raises(InvalidError):
            await service.upsert_points(
                key,
                [DataPoint(timestamp=_ts(10), value="not-a-float")],
                create_if_not_found=True,
                validate_data_type=DataType.FLOAT,
            )

    async def test_validate_data_type_allows_empty_points_on_new_series(
        self, service: TimeSeriesService
    ):
        """validate_data_type allows series creation even with no points."""
        key = SeriesKey(owner_id=DEVICE_ID, metric=SETPOINT)
        await service.upsert_points(
            key,
            [],
            create_if_not_found=True,
            validate_data_type=DataType.FLOAT,
        )
        series = await service.get_series_by_key(key)
        assert series is not None
        assert series.data_type == DataType.FLOAT
