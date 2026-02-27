from __future__ import annotations

import csv
import io
from datetime import UTC, datetime, timedelta

import pytest
from models.errors import NotFoundError
from timeseries.domain import DataPoint, DataType
from timeseries.service import TimeSeriesService
from timeseries.storage import MemoryStorage

pytestmark = pytest.mark.asyncio


@pytest.fixture
def service() -> TimeSeriesService:
    return TimeSeriesService(storage=MemoryStorage())


def parse_csv(csv_str: str) -> tuple[list[str], list[list[str]]]:
    reader = csv.reader(io.StringIO(csv_str))
    rows = list(reader)
    if not rows:
        return [], []
    return rows[0], rows[1:]


class TestExportCsvSingleSeries:
    async def test_single_point(self, service: TimeSeriesService):
        series = await service.create_series(
            data_type=DataType.FLOAT,
            owner_id="d1",
            metric="temperature",
        )
        t1 = datetime(2024, 1, 15, 8, 0, 0, tzinfo=UTC)
        await service.upsert_points(series.key, [DataPoint(timestamp=t1, value=20.5)])

        result = await service.export_csv([series.id])

        header, rows = parse_csv(result)
        assert header == ["timestamp", "temperature"]
        assert len(rows) == 1
        assert rows[0][0] == "2024-01-15T08:00:00+00:00"
        assert rows[0][1] == "20.5"

    async def test_multiple_points_sorted_asc(self, service: TimeSeriesService):
        series = await service.create_series(
            data_type=DataType.FLOAT,
            owner_id="d1",
            metric="temperature",
        )
        t1 = datetime(2024, 1, 1, tzinfo=UTC)
        t2 = datetime(2024, 1, 2, tzinfo=UTC)
        t3 = datetime(2024, 1, 3, tzinfo=UTC)
        await service.upsert_points(
            series.key,
            [
                DataPoint(timestamp=t3, value=3.0),
                DataPoint(timestamp=t1, value=1.0),
                DataPoint(timestamp=t2, value=2.0),
            ],
        )

        result = await service.export_csv([series.id])

        _, rows = parse_csv(result)
        assert len(rows) == 3
        assert rows[0][1] == "1.0"
        assert rows[1][1] == "2.0"
        assert rows[2][1] == "3.0"


class TestExportCsvMultipleSeries:
    async def test_interleaved_timestamps_locf(self, service: TimeSeriesService):
        s1 = await service.create_series(
            data_type=DataType.FLOAT,
            owner_id="d1",
            metric="temperature",
        )
        s2 = await service.create_series(
            data_type=DataType.FLOAT,
            owner_id="d1",
            metric="humidity",
        )
        t1 = datetime(2024, 1, 1, 0, tzinfo=UTC)
        t2 = datetime(2024, 1, 1, 1, tzinfo=UTC)
        t3 = datetime(2024, 1, 1, 2, tzinfo=UTC)
        await service.upsert_points(
            s1.key,
            [
                DataPoint(timestamp=t1, value=20.5),
                DataPoint(timestamp=t3, value=21.0),
            ],
        )
        await service.upsert_points(s2.key, [DataPoint(timestamp=t2, value=60.0)])

        result = await service.export_csv([s1.id, s2.id])

        header, rows = parse_csv(result)
        assert header == ["timestamp", "temperature", "humidity"]
        assert len(rows) == 3
        # t1: temperature=20.5, humidity="" (no data yet)
        assert rows[0][1] == "20.5"
        assert rows[0][2] == ""
        # t2: temperature=20.5 (LOCF), humidity=60.0
        assert rows[1][1] == "20.5"
        assert rows[1][2] == "60.0"
        # t3: temperature=21.0, humidity=60.0 (LOCF)
        assert rows[2][1] == "21.0"
        assert rows[2][2] == "60.0"

    async def test_carry_forward_seeds_past_value(self, service: TimeSeriesService):
        series = await service.create_series(
            data_type=DataType.FLOAT,
            owner_id="d1",
            metric="temperature",
        )
        t1 = datetime(2024, 1, 1, tzinfo=UTC)
        t2 = datetime(2024, 1, 2, tzinfo=UTC)
        t3 = datetime(2024, 1, 3, tzinfo=UTC)
        await service.upsert_points(
            series.key,
            [
                DataPoint(timestamp=t1, value=10.0),
                DataPoint(timestamp=t3, value=30.0),
            ],
        )

        result = await service.export_csv([series.id], start=t2, carry_forward=True)

        _, rows = parse_csv(result)
        assert len(rows) == 2
        # First row at t2 carries forward the value from t1
        assert rows[0][1] == "10.0"
        assert rows[1][1] == "30.0"

    async def test_carry_forward_false_by_default(self, service: TimeSeriesService):
        series = await service.create_series(
            data_type=DataType.FLOAT,
            owner_id="d1",
            metric="temperature",
        )
        t1 = datetime(2024, 1, 1, tzinfo=UTC)
        t2 = datetime(2024, 1, 2, tzinfo=UTC)
        t3 = datetime(2024, 1, 3, tzinfo=UTC)
        await service.upsert_points(
            series.key,
            [
                DataPoint(timestamp=t1, value=10.0),
                DataPoint(timestamp=t3, value=30.0),
            ],
        )

        result = await service.export_csv([series.id], start=t2)

        _, rows = parse_csv(result)
        # Without carry_forward only t3 (inside window) appears
        assert len(rows) == 1
        assert rows[0][1] == "30.0"


class TestExportCsvLast:
    async def test_last_param_resolves(self, service: TimeSeriesService):
        series = await service.create_series(
            data_type=DataType.FLOAT,
            owner_id="d1",
            metric="temperature",
        )
        now = datetime.now(tz=UTC)
        old = now - timedelta(hours=5)
        recent = now - timedelta(hours=1)
        await service.upsert_points(
            series.key,
            [
                DataPoint(timestamp=old, value=1.0),
                DataPoint(timestamp=recent, value=2.0),
            ],
        )

        result = await service.export_csv([series.id], last="3h", carry_forward=True)

        _, rows = parse_csv(result)
        # carry_forward seeds the old value at the window start, then the recent point
        assert len(rows) == 2
        assert rows[0][1] == "1.0"
        assert rows[1][1] == "2.0"


class TestExportCsvErrors:
    async def test_unknown_series_id_raises(self, service: TimeSeriesService):
        with pytest.raises(NotFoundError):
            await service.export_csv(["nonexistent"])
