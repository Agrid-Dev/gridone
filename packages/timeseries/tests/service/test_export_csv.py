from __future__ import annotations

import csv
import io
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING
from unittest.mock import patch

import pytest
import pytest_asyncio

from models.errors import NotFoundError
from timeseries.domain import DataPoint, DataType
from timeseries.service import TimeSeriesService

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def service() -> AsyncIterator[TimeSeriesService]:
    service = TimeSeriesService(storage_url=None)
    await service.start()
    yield service
    await service.stop()


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


class TestExportCsvTimezone:
    @pytest.mark.parametrize(
        ("tz", "ts_utc", "expected_suffix"),
        [
            ("UTC", datetime(2026, 1, 15, 10, 0, 0, tzinfo=UTC), "+00:00"),
            ("Europe/Paris", datetime(2026, 1, 15, 10, 0, 0, tzinfo=UTC), "+01:00"),
            ("Europe/Paris", datetime(2026, 7, 15, 10, 0, 0, tzinfo=UTC), "+02:00"),
        ],
    )
    async def test_timestamp_offset_in_csv(
        self, tz: str, ts_utc: datetime, expected_suffix: str
    ):
        svc = TimeSeriesService(storage_url=None, default_timezone=tz)
        await svc.start()
        try:
            series = await svc.create_series(
                data_type=DataType.FLOAT, owner_id="d1", metric="temp"
            )
            point = DataPoint(timestamp=ts_utc, value=1.0)
            await svc.upsert_points(series.key, [point])
            result = await svc.export_csv([series.id])
            _, rows = parse_csv(result)
            assert rows[0][0].endswith(expected_suffix)
        finally:
            await svc.stop()

    @pytest.mark.parametrize(
        ("ts_utc", "expected_suffix"),
        [
            # Spring-forward 2026-03-29: before = CET +01:00, after = CEST +02:00
            (datetime(2026, 3, 29, 0, 30, 0, tzinfo=UTC), "+01:00"),
            (datetime(2026, 3, 29, 2, 30, 0, tzinfo=UTC), "+02:00"),
            # Fall-back 2026-10-25: before = CEST +02:00, after = CET +01:00
            (datetime(2026, 10, 25, 0, 30, 0, tzinfo=UTC), "+02:00"),
            (datetime(2026, 10, 25, 2, 30, 0, tzinfo=UTC), "+01:00"),
        ],
    )
    async def test_dst_transition_offset(self, ts_utc: datetime, expected_suffix: str):
        svc = TimeSeriesService(storage_url=None, default_timezone="Europe/Paris")
        await svc.start()
        try:
            series = await svc.create_series(
                data_type=DataType.FLOAT, owner_id="d1", metric="temp"
            )
            point = DataPoint(timestamp=ts_utc, value=1.0)
            await svc.upsert_points(series.key, [point])
            result = await svc.export_csv([series.id])
            _, rows = parse_csv(result)
            assert rows[0][0].endswith(expected_suffix)
        finally:
            await svc.stop()

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
    async def test_naive_start_filters_correctly(
        self,
        naive_local: datetime,
        tz: str,
        t_inside_utc: datetime,
        t_outside_utc: datetime,
    ):
        svc = TimeSeriesService(storage_url=None, default_timezone=tz)
        await svc.start()
        try:
            series = await svc.create_series(
                data_type=DataType.FLOAT, owner_id="d1", metric="temp"
            )
            await svc.upsert_points(
                series.key,
                [
                    DataPoint(timestamp=t_outside_utc, value=1.0),
                    DataPoint(timestamp=t_inside_utc, value=2.0),
                ],
            )
            result = await svc.export_csv([series.id], start=naive_local)
            _, rows = parse_csv(result)
            assert len(rows) == 1
            assert rows[0][1] == "2.0"
        finally:
            await svc.stop()


class TestExportCsvErrors:
    async def test_unknown_series_id_raises(self, service: TimeSeriesService):
        with pytest.raises(NotFoundError):
            await service.export_csv(["nonexistent"])


class TestExportCsvTruncation:
    async def test_truncation_marker_appended_when_series_exceeds_limit(
        self, service: TimeSeriesService
    ):
        series = await service.create_series(
            data_type=DataType.FLOAT, owner_id="d1", metric="temp"
        )
        base = datetime(2026, 1, 1, tzinfo=UTC)
        pts = [
            DataPoint(timestamp=base + timedelta(minutes=i), value=float(i))
            for i in range(5)
        ]
        await service.upsert_points(series.key, pts)

        with patch("timeseries.service.service.MAX_RAW_LIMIT", 3):
            result = await service.export_csv([series.id])

        assert "# truncated to 3 points" in result

    async def test_no_truncation_marker_when_within_limit(
        self, service: TimeSeriesService
    ):
        series = await service.create_series(
            data_type=DataType.FLOAT, owner_id="d1", metric="temp"
        )
        t1 = datetime(2026, 1, 1, tzinfo=UTC)
        await service.upsert_points(series.key, [DataPoint(timestamp=t1, value=1.0)])
        result = await service.export_csv([series.id])
        assert "#" not in result
