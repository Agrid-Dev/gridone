import os
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest
import pytest_asyncio
import yaml

from models.errors import InvalidError, NotFoundError
from timeseries.domain import (
    AggregationOperator,
    AggregationQuery,
    AggregationResult,
    DataPoint,
    DataType,
    Interval,
    SeriesKey,
)
from timeseries.service import TimeSeriesService
from timeseries.service.auto_interval import (
    resolve_auto_interval,
    valid_intervals_for_period,
)

pytestmark = pytest.mark.asyncio

_CASES_DIR = Path(__file__).parent.parent / "fixtures" / "cases"
_INPUTS_DIR = Path(__file__).parent.parent / "fixtures" / "inputs"
_SCENARIOS: dict[str, dict] = {}


def load_scenarios() -> list:
    for path in sorted(_CASES_DIR.glob("*.yaml")):
        with path.open() as f:
            case = yaml.safe_load(f)
        _SCENARIOS[case["name"]] = case
    return [pytest.param(name, id=name) for name in _SCENARIOS]


def _load_input(input_ref: str) -> dict:
    with (_INPUTS_DIR / f"{input_ref}.yaml").open() as f:
        return yaml.safe_load(f)


def _parse_dt(s: str | None) -> datetime | None:
    return datetime.fromisoformat(s) if s is not None else None


@pytest_asyncio.fixture(
    params=[
        pytest.param("memory", id="memory"),
        pytest.param(
            "timescale",
            id="timescale",
            marks=[
                pytest.mark.integration,
                pytest.mark.skipif(
                    os.environ.get("POSTGRES_TEST_URL") is None,
                    reason="POSTGRES_TEST_URL not set",
                ),
            ],
        ),
    ]
)
async def ts_service(
    request: pytest.FixtureRequest,
) -> AsyncIterator[TimeSeriesService]:
    import asyncpg

    url = None if request.param == "memory" else os.environ["POSTGRES_TEST_URL"]
    service = TimeSeriesService(url)
    await service.start()
    if url is not None:
        conn = await asyncpg.connect(url)
        try:
            await conn.execute("TRUNCATE ts_data_points, ts_series;")
        finally:
            await conn.close()
    yield service
    await service.stop()


def assert_aggregation_equal(actual: AggregationResult, expected_key: str) -> None:
    expected_points = _SCENARIOS[expected_key]["expected"]
    assert len(actual.points) == len(expected_points)
    for actual_pt, exp in zip(actual.points, expected_points, strict=True):
        assert actual_pt.interval_start == datetime.fromisoformat(exp["interval_start"])
        assert actual_pt.count == exp["count"]
        if isinstance(exp["value"], float):
            assert actual_pt.value == pytest.approx(exp["value"], rel=1e-4)
        else:
            assert actual_pt.value == exp["value"]


@pytest.mark.parametrize("case_name", load_scenarios())
async def test_aggregate(
    ts_service: TimeSeriesService,
    case_name: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    scenario = _SCENARIOS[case_name]
    inp = _load_input(scenario["input_ref"])
    key = SeriesKey(owner_id="test", metric=case_name)

    await ts_service.create_series(
        data_type=DataType(inp["input"]["data_type"]),
        owner_id=key.owner_id,
        metric=key.metric,
    )
    await ts_service.upsert_points(
        key,
        [
            DataPoint(
                timestamp=datetime.fromisoformat(p["timestamp"]),
                value=p["value"],
            )
            for p in inp["input"]["points"]
        ],
    )

    req = scenario["request"]
    query = AggregationQuery(
        agg=req["agg"],
        interval=req["interval"],
        start=_parse_dt(req.get("start")),
        end=_parse_dt(req.get("end")),
        timezone=req.get("timezone"),
    )

    # Freeze "now" to end + 1 day so future-bucket filtering never interferes
    # with bucketing-correctness assertions — the scenario data may be in the future.
    end_dt = _parse_dt(req.get("end"))
    if end_dt is not None:
        synthetic_now = end_dt + timedelta(days=1)
        if synthetic_now.tzinfo is None:
            synthetic_now = synthetic_now.replace(tzinfo=UTC)
        monkeypatch.setattr("timeseries.service.service._utcnow", lambda: synthetic_now)

    result = await ts_service.get_aggregate(key, query)
    assert_aggregation_equal(result, case_name)


class TestGetAggregateValidation:
    async def test_incompatible_operator_raises(
        self, ts_service: TimeSeriesService
    ) -> None:
        key = SeriesKey(owner_id="test", metric="str_series")
        await ts_service.create_series(
            data_type=DataType.STRING, owner_id=key.owner_id, metric=key.metric
        )
        with pytest.raises(InvalidError):
            await ts_service.get_aggregate(
                key,
                AggregationQuery(
                    agg=AggregationOperator.AVG, interval=Interval.model_validate("1d")
                ),
            )

    async def test_series_not_found_raises(self, ts_service: TimeSeriesService) -> None:
        key = SeriesKey(owner_id="test", metric="nonexistent")
        with pytest.raises(NotFoundError):
            await ts_service.get_aggregate(
                key,
                AggregationQuery(
                    agg=AggregationOperator.COUNT,
                    interval=Interval.model_validate("1d"),
                ),
            )

    async def test_last_resolved_to_start(self, ts_service: TimeSeriesService) -> None:
        key = SeriesKey(owner_id="test", metric="ts_last")
        await ts_service.create_series(
            data_type=DataType.INT, owner_id=key.owner_id, metric=key.metric
        )
        result = await ts_service.get_aggregate(
            key,
            AggregationQuery(
                agg=AggregationOperator.COUNT,
                interval=Interval.model_validate("1d"),
                last="7d",
                end=datetime(2026, 5, 13, tzinfo=UTC),
            ),
        )
        assert result is not None

    async def test_missing_start_or_end_raises(
        self, ts_service: TimeSeriesService
    ) -> None:
        key = SeriesKey(owner_id="test", metric="no_range_series")
        await ts_service.create_series(
            data_type=DataType.INT, owner_id=key.owner_id, metric=key.metric
        )
        now = datetime(2024, 1, 1, tzinfo=UTC)
        with pytest.raises(InvalidError):
            await ts_service.get_aggregate(
                key,
                AggregationQuery(
                    agg=AggregationOperator.COUNT,
                    interval=Interval.model_validate("1d"),
                    start=now,
                ),
            )
        with pytest.raises(InvalidError):
            await ts_service.get_aggregate(
                key,
                AggregationQuery(
                    agg=AggregationOperator.COUNT,
                    interval=Interval.model_validate("1d"),
                    end=now,
                ),
            )


class TestGetAggregateTzAware:
    async def test_timezone_filled_from_service_default(self):
        svc = TimeSeriesService(storage_url=None, default_timezone="Europe/Paris")
        await svc.start()
        try:
            key = SeriesKey(owner_id="tz-test", metric="tz_fill")
            await svc.create_series(
                data_type=DataType.INT, owner_id=key.owner_id, metric=key.metric
            )
            result = await svc.get_aggregate(
                key,
                AggregationQuery(
                    agg=AggregationOperator.COUNT,
                    interval=Interval.model_validate("1d"),
                    start=datetime(2026, 1, 1, tzinfo=UTC),
                    end=datetime(2026, 1, 2, tzinfo=UTC),
                ),
            )
            assert result.timezone == "Europe/Paris"
        finally:
            await svc.stop()

    async def test_buckets_aligned_to_service_timezone(self):
        # Paris CET midnight is 23:00 UTC the previous day. A point at 23:30 UTC
        # belongs to the next Paris calendar day, not the UTC day. The bucket's
        # interval_start must reflect the Paris day boundary, not the UTC one.
        svc = TimeSeriesService(storage_url=None, default_timezone="Europe/Paris")
        await svc.start()
        try:
            key = SeriesKey(owner_id="tz-test", metric="bucket_align")
            await svc.create_series(
                data_type=DataType.INT, owner_id=key.owner_id, metric=key.metric
            )
            # 23:30 UTC = 00:30 CET → belongs to Paris calendar day 2026-01-16
            point_utc = datetime(2026, 1, 15, 23, 30, 0, tzinfo=UTC)
            await svc.upsert_points(key, [DataPoint(timestamp=point_utc, value=1)])
            result = await svc.get_aggregate(
                key,
                AggregationQuery(
                    agg=AggregationOperator.COUNT,
                    interval=Interval.model_validate("1d"),
                    start=datetime(2026, 1, 15, 23, 0, 0, tzinfo=UTC),
                    end=datetime(2026, 1, 16, 23, 0, 0, tzinfo=UTC),
                ),
            )
            assert result.timezone == "Europe/Paris"
            assert len(result.points) == 1
            # Bucket start is Paris midnight 2026-01-16 → 2026-01-15T23:00:00+00:00 UTC
            expected_bucket = datetime(2026, 1, 15, 23, 0, 0, tzinfo=UTC)
            assert result.points[0].interval_start == expected_bucket
            assert result.points[0].count == 1
        finally:
            await svc.stop()

    async def test_explicit_query_timezone_preserved(self):
        svc = TimeSeriesService(storage_url=None, default_timezone="Europe/Paris")
        await svc.start()
        try:
            key = SeriesKey(owner_id="tz-test", metric="tz_explicit")
            await svc.create_series(
                data_type=DataType.INT, owner_id=key.owner_id, metric=key.metric
            )
            result = await svc.get_aggregate(
                key,
                AggregationQuery(
                    agg=AggregationOperator.COUNT,
                    interval=Interval.model_validate("1d"),
                    start=datetime(2026, 1, 1, tzinfo=UTC),
                    end=datetime(2026, 1, 2, tzinfo=UTC),
                    timezone="UTC",
                ),
            )
            assert result.timezone == "UTC"
        finally:
            await svc.stop()

    @pytest.mark.parametrize(
        ("naive_start", "tz", "t_inside_utc", "t_outside_utc"),
        [
            # Paris CET (UTC+1): naive 01:00 → 00:00 UTC
            (
                datetime(2026, 1, 16, 1, 0, 0),  # noqa: DTZ001
                "Europe/Paris",
                datetime(2026, 1, 16, 0, 30, 0, tzinfo=UTC),
                datetime(2026, 1, 15, 23, 30, 0, tzinfo=UTC),
            ),
            # Paris CEST (UTC+2): naive 01:00 → 23:00 UTC prev day
            (
                datetime(2026, 7, 16, 1, 0, 0),  # noqa: DTZ001
                "Europe/Paris",
                datetime(2026, 7, 15, 23, 30, 0, tzinfo=UTC),
                datetime(2026, 7, 15, 22, 30, 0, tzinfo=UTC),
            ),
        ],
    )
    async def test_naive_start_normalized_by_service_tz(
        self,
        naive_start: datetime,
        tz: str,
        t_inside_utc: datetime,
        t_outside_utc: datetime,
        monkeypatch: pytest.MonkeyPatch,
    ):
        svc = TimeSeriesService(storage_url=None, default_timezone=tz)
        await svc.start()
        try:
            key = SeriesKey(owner_id="tz-test", metric="naive_agg_start")
            await svc.create_series(
                data_type=DataType.INT, owner_id=key.owner_id, metric=key.metric
            )
            await svc.upsert_points(
                key,
                [
                    DataPoint(timestamp=t_outside_utc, value=1),
                    DataPoint(timestamp=t_inside_utc, value=2),
                ],
            )
            end = t_inside_utc + timedelta(hours=2)
            frozen_now = end + timedelta(days=1)
            monkeypatch.setattr(
                "timeseries.service.service._utcnow", lambda: frozen_now
            )
            result = await svc.get_aggregate(
                key,
                AggregationQuery(
                    agg=AggregationOperator.COUNT,
                    interval=Interval.model_validate("1d"),
                    start=naive_start,
                    end=end,
                ),
            )
            total = sum(p.count for p in result.points)
            assert total == 1
        finally:
            await svc.stop()


class TestGetAggregateDefects:
    async def test_no_future_buckets(self, monkeypatch: pytest.MonkeyPatch) -> None:
        svc = TimeSeriesService(storage_url=None)
        await svc.start()
        try:
            key = SeriesKey(owner_id="future-test", metric="temp")
            await svc.create_series(
                data_type=DataType.FLOAT, owner_id=key.owner_id, metric=key.metric
            )
            pt_ts = datetime(2026, 1, 1, 10, tzinfo=UTC)
            await svc.upsert_points(key, [DataPoint(timestamp=pt_ts, value=1.0)])
            frozen_now = datetime(2026, 1, 1, 13, tzinfo=UTC)
            monkeypatch.setattr(
                "timeseries.service.service._utcnow", lambda: frozen_now
            )
            result = await svc.get_aggregate(
                key,
                AggregationQuery(
                    agg=AggregationOperator.COUNT,
                    interval=Interval.model_validate("1h"),
                    start=datetime(2026, 1, 1, tzinfo=UTC),
                    end=datetime(2026, 1, 2, tzinfo=UTC),
                ),
            )
            assert len(result.points) == 14  # [00:00 … 13:00] inclusive
            assert all(p.interval_start <= frozen_now for p in result.points)
        finally:
            await svc.stop()

    async def test_last_alone_sets_end_to_now(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        svc = TimeSeriesService(storage_url=None)
        await svc.start()
        try:
            key = SeriesKey(owner_id="last-test", metric="temp")
            await svc.create_series(
                data_type=DataType.FLOAT, owner_id=key.owner_id, metric=key.metric
            )
            frozen_now = datetime(2026, 1, 10, 12, tzinfo=UTC)
            pt_ts = datetime(2026, 1, 10, 6, tzinfo=UTC)
            await svc.upsert_points(key, [DataPoint(timestamp=pt_ts, value=5.0)])
            monkeypatch.setattr(
                "timeseries.service.service._utcnow", lambda: frozen_now
            )
            result = await svc.get_aggregate(
                key,
                AggregationQuery(
                    agg=AggregationOperator.COUNT,
                    interval=Interval.model_validate("1h"),
                    last="12h",
                ),
            )
            # last="12h" → start=2026-01-10T00:00Z, end=frozen_now=2026-01-10T12:00Z
            assert result.points[0].interval_start == datetime(2026, 1, 10, tzinfo=UTC)
            assert any(p.count > 0 for p in result.points)
            assert all(p.interval_start <= frozen_now for p in result.points)
        finally:
            await svc.stop()

    async def test_naive_input_interpreted_in_resolved_tz(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Naive start in Europe/Paris → Paris midnight, not UTC midnight."""
        svc = TimeSeriesService(storage_url=None, default_timezone="Europe/Paris")
        await svc.start()
        try:
            key = SeriesKey(owner_id="naive-paris", metric="temp")
            await svc.create_series(
                data_type=DataType.FLOAT, owner_id=key.owner_id, metric=key.metric
            )
            # Paris midnight on 2026-05-17 = 2026-05-16T22:00:00Z (CEST = UTC+2)
            paris_midnight_utc = datetime(2026, 5, 16, 22, tzinfo=UTC)
            pt = DataPoint(
                timestamp=paris_midnight_utc + timedelta(minutes=30), value=21.0
            )
            await svc.upsert_points(key, [pt])
            # naive — interpreted in Europe/Paris (CEST = UTC+2)
            naive_start = datetime(2026, 5, 17)  # noqa: DTZ001
            naive_end = datetime(2026, 5, 18)  # noqa: DTZ001
            monkeypatch.setattr(
                "timeseries.service.service._utcnow",
                lambda: datetime(2026, 5, 19, tzinfo=UTC),
            )
            result = await svc.get_aggregate(
                key,
                AggregationQuery(
                    agg=AggregationOperator.AVG,
                    interval=Interval.model_validate("1h"),
                    start=naive_start,
                    end=naive_end,
                ),
            )
            # First bucket starts at Paris midnight (UTC 22:00 prev day)
            first_bucket_local = result.points[0].interval_start.astimezone(
                ZoneInfo("Europe/Paris")
            )
            assert first_bucket_local.hour == 0
            assert first_bucket_local.minute == 0
            assert str(first_bucket_local.utcoffset()) == "2:00:00"
        finally:
            await svc.stop()

    @pytest.mark.parametrize(
        ("tz_name", "expected_offset_hours"),
        [
            ("UTC", 0),
            ("Europe/Paris", 1),  # CET (January)
            ("Asia/Kolkata", None),  # +05:30 — checked by minutes
        ],
    )
    async def test_interval_start_offset_by_timezone(
        self,
        tz_name: str,
        expected_offset_hours: int | None,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        svc = TimeSeriesService(storage_url=None, default_timezone=tz_name)
        await svc.start()
        try:
            key = SeriesKey(owner_id=f"tz-offset-{tz_name}", metric="temp")
            await svc.create_series(
                data_type=DataType.INT, owner_id=key.owner_id, metric=key.metric
            )
            monkeypatch.setattr(
                "timeseries.service.service._utcnow",
                lambda: datetime(2026, 1, 4, tzinfo=UTC),
            )
            result = await svc.get_aggregate(
                key,
                AggregationQuery(
                    agg=AggregationOperator.COUNT,
                    interval=Interval.model_validate("1d"),
                    start=datetime(2026, 1, 1, tzinfo=UTC),
                    end=datetime(2026, 1, 3, tzinfo=UTC),
                ),
            )
            assert result.timezone == tz_name
            tz = ZoneInfo(tz_name)
            for pt in result.points:
                local = pt.interval_start.astimezone(tz)
                assert local.hour == 0
                assert local.minute == 0
                offset_secs = local.utcoffset().total_seconds()  # type: ignore[union-attr]
                if expected_offset_hours is not None:
                    assert offset_secs == expected_offset_hours * 3600
                else:
                    # Kolkata +05:30
                    assert offset_secs == 5 * 3600 + 30 * 60
        finally:
            await svc.stop()

    async def test_interval_start_offset_paris_cest(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Paris CEST (summer, UTC+2): daily buckets start at 22:00 UTC prev day."""
        svc = TimeSeriesService(storage_url=None, default_timezone="Europe/Paris")
        await svc.start()
        try:
            key = SeriesKey(owner_id="paris-cest", metric="temp")
            await svc.create_series(
                data_type=DataType.INT, owner_id=key.owner_id, metric=key.metric
            )
            monkeypatch.setattr(
                "timeseries.service.service._utcnow",
                lambda: datetime(2026, 7, 4, tzinfo=UTC),
            )
            result = await svc.get_aggregate(
                key,
                AggregationQuery(
                    agg=AggregationOperator.COUNT,
                    interval=Interval.model_validate("1d"),
                    start=datetime(2026, 7, 1, tzinfo=UTC),
                    end=datetime(2026, 7, 3, tzinfo=UTC),
                ),
            )
            paris = ZoneInfo("Europe/Paris")
            for pt in result.points:
                local = pt.interval_start.astimezone(paris)
                assert local.hour == 0
                assert local.minute == 0
                assert local.utcoffset().total_seconds() == 2 * 3600  # type: ignore[union-attr]
        finally:
            await svc.stop()


class TestArbitraryIntervalBuckets:
    async def test_5h_bucket_positions_utc(self, ts_service: TimeSeriesService) -> None:
        """5h interval over 24h UTC produces 5 buckets at 00:00, 05:00, …, 20:00."""
        key = SeriesKey(owner_id="bucket-pos", metric="5h_buckets")
        await ts_service.create_series(
            data_type=DataType.INT, owner_id=key.owner_id, metric=key.metric
        )
        result = await ts_service.get_aggregate(
            key,
            AggregationQuery(
                agg=AggregationOperator.COUNT,
                interval=Interval.model_validate("5h"),
                start=datetime(2026, 1, 1, tzinfo=UTC),
                end=datetime(2026, 1, 2, tzinfo=UTC),
                timezone="UTC",
            ),
        )
        expected_starts = [
            datetime(2026, 1, 1, h, tzinfo=UTC) for h in (0, 5, 10, 15, 20)
        ]
        assert [p.interval_start for p in result.points] == expected_starts

    async def test_2d_bucket_positions(self, ts_service: TimeSeriesService) -> None:
        """2d interval over 6 days produces 3 buckets aligned to Postgres origin.

        Postgres time_bucket anchors day intervals at 2000-01-03. Jan 2, 2026 is
        9496 days from that origin (even), so it is a 2d boundary. Starting there
        gives clean buckets at Jan 2, 4, 6 on both backends.
        """
        key = SeriesKey(owner_id="bucket-pos", metric="2d_buckets")
        await ts_service.create_series(
            data_type=DataType.INT, owner_id=key.owner_id, metric=key.metric
        )
        result = await ts_service.get_aggregate(
            key,
            AggregationQuery(
                agg=AggregationOperator.COUNT,
                interval=Interval.model_validate("2d"),
                start=datetime(2026, 1, 2, tzinfo=UTC),
                end=datetime(2026, 1, 8, tzinfo=UTC),
                timezone="UTC",
            ),
        )
        expected_starts = [datetime(2026, 1, d, tzinfo=UTC) for d in (2, 4, 6)]
        assert [p.interval_start for p in result.points] == expected_starts

    async def test_5h_bucket_positions_non_utc(
        self, ts_service: TimeSeriesService
    ) -> None:
        """5h in Europe/Paris anchors at Paris midnight, not UTC midnight.

        Jan 1 2026 is CET (UTC+1). Starting at midnight Paris (= 23:00 UTC Dec 31)
        gives 5 buckets at 00:00, 05:00, 10:00, 15:00, 20:00 Paris. Both backends
        must agree, confirming memory's midnight-anchor matches PG time_bucket(..., tz).
        """
        paris = ZoneInfo("Europe/Paris")
        key = SeriesKey(owner_id="bucket-pos", metric="5h_paris")
        await ts_service.create_series(
            data_type=DataType.INT, owner_id=key.owner_id, metric=key.metric
        )
        result = await ts_service.get_aggregate(
            key,
            AggregationQuery(
                agg=AggregationOperator.COUNT,
                interval=Interval.model_validate("5h"),
                start=datetime(2025, 12, 31, 23, 0, 0, tzinfo=UTC),
                end=datetime(2026, 1, 1, 23, 0, 0, tzinfo=UTC),
                timezone="Europe/Paris",
            ),
        )
        expected_starts = [
            datetime(2026, 1, 1, h, tzinfo=paris) for h in (0, 5, 10, 15, 20)
        ]
        actual_starts = [p.interval_start.astimezone(paris) for p in result.points]
        assert actual_starts == expected_starts

    async def test_1d_dst_fall_back_bucket_positions(
        self, ts_service: TimeSeriesService, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """1d buckets over Europe/Paris DST fall-back must not shift by one day.

        2026-10-25 is the fall-back day (25h). A point at 23:00 CET (= 22:00 UTC)
        must land in the Oct 25 bucket, not Oct 26. The previous UTC-elapsed floor
        returned slot_s == 86400 for this 25-hour day, advancing to Oct 26.
        """
        paris = ZoneInfo("Europe/Paris")
        monkeypatch.setattr(
            "timeseries.service.service._utcnow",
            lambda: datetime(2026, 10, 28, tzinfo=UTC),
        )
        key = SeriesKey(owner_id="dst-test", metric="fall_back_1d")
        await ts_service.create_series(
            data_type=DataType.INT, owner_id=key.owner_id, metric=key.metric
        )
        # Point at 23:00 CET Oct 25 = 22:00 UTC
        point_utc = datetime(2026, 10, 25, 22, 0, 0, tzinfo=UTC)
        await ts_service.upsert_points(key, [DataPoint(timestamp=point_utc, value=1)])

        result = await ts_service.get_aggregate(
            key,
            AggregationQuery(
                agg=AggregationOperator.COUNT,
                interval=Interval.model_validate("1d"),
                start=datetime(2026, 10, 24, 22, 0, 0, tzinfo=UTC),
                end=datetime(2026, 10, 27, 23, 0, 0, tzinfo=UTC),
                timezone="Europe/Paris",
            ),
        )
        buckets_with_data = [p for p in result.points if p.count > 0]
        assert len(buckets_with_data) == 1
        bucket_local = buckets_with_data[0].interval_start.astimezone(paris)
        assert bucket_local.day == 25, f"Expected Oct 25, got {bucket_local}"


class TestIntervalValidation:
    @pytest.mark.parametrize(
        "interval",
        ["5min", "10min", "30min", "2h", "6h", "7d", "15min", "1h", "1d", "1mo"],
    )
    async def test_valid_arbitrary_intervals_accepted(
        self, interval: str, ts_service: TimeSeriesService
    ) -> None:
        key = SeriesKey(owner_id="interval-valid", metric=f"iv_{interval}")
        await ts_service.create_series(
            data_type=DataType.INT, owner_id=key.owner_id, metric=key.metric
        )
        result = await ts_service.get_aggregate(
            key,
            AggregationQuery(
                agg=AggregationOperator.COUNT,
                interval=Interval.model_validate(interval),
                start=datetime(2026, 1, 1, tzinfo=UTC),
                end=datetime(2026, 1, 2, tzinfo=UTC),
            ),
        )
        assert str(result.interval) == interval


class TestResolveAutoInterval:
    @pytest.mark.parametrize(
        ("period", "expected_interval"),
        [
            (timedelta(hours=6), None),  # ≤ 24h → raw
            (timedelta(hours=24), None),  # boundary: exactly 24h → raw
            (timedelta(days=1, seconds=1), "15min"),  # just over 24h → 15min
            (timedelta(days=3), "15min"),  # ≤ 7d → 15min
            (timedelta(days=7), "15min"),  # boundary: exactly 7d → 15min
            (timedelta(days=14), "1h"),  # ≤ 30d → 1h
            (timedelta(days=30), "1h"),  # boundary: exactly 30d → 1h
            (timedelta(days=60), "1d"),  # ≤ 180d → 1d
            (timedelta(days=180), "1d"),  # boundary: exactly 180d → 1d
            (timedelta(days=365), "1mo"),  # > 180d → 1mo
        ],
    )
    async def test_resolve_auto_interval(
        self, period: timedelta, expected_interval: str | None
    ) -> None:
        result = resolve_auto_interval(period)
        if expected_interval is None:
            assert result is None
        else:
            assert result is not None
            assert str(result) == expected_interval


class TestValidIntervalsForPeriod:
    @pytest.mark.parametrize(
        ("period", "expected_strs"),
        [
            # 1h: 15min→4 ✓, 1h→1 ✗, 1d→<1 ✗
            (timedelta(hours=1), ["raw", "15min"]),
            # 24h boundary: 15min→96 ✓, 1h→24 ✓, 1d→1 ✗
            (timedelta(hours=24), ["raw", "15min", "1h"]),
            # 7d: 15min→672 ✓, 1h→168 ✓, 1d→7 ✓, 1mo→0.23 ✗
            (timedelta(days=7), ["raw", "15min", "1h", "1d"]),
            # 30d boundary: 15min→2880 ✗, 1h→720 ✓, 1d→30 ✓, 1mo→1 ✗
            (timedelta(days=30), ["raw", "1h", "1d"]),
            # 180d boundary: 15min→17280 ✗, 1h→4320 ✗, 1d→180 ✓, 1mo→6 ✓
            (timedelta(days=180), ["raw", "1d", "1mo"]),
            # 365d: 1d→365 ✓, 1mo→12.16 ✓
            (timedelta(days=365), ["raw", "1d", "1mo"]),
        ],
    )
    async def test_valid_intervals_for_period(
        self, period: timedelta, expected_strs: list[str]
    ) -> None:
        result = valid_intervals_for_period(period)
        result_strs = ["raw" if iv is None else str(iv) for iv in result]
        assert result_strs == expected_strs


class TestAutoIntervalService:
    async def test_auto_interval_resolves_to_15min_for_7d(
        self, ts_service: TimeSeriesService, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        key = SeriesKey(owner_id="auto-test", metric="temp")
        await ts_service.create_series(
            data_type=DataType.FLOAT, owner_id=key.owner_id, metric=key.metric
        )
        end = datetime(2026, 1, 8, tzinfo=UTC)
        monkeypatch.setattr("timeseries.service.service._utcnow", lambda: end)
        result = await ts_service.get_aggregate(
            key,
            AggregationQuery(agg=AggregationOperator.COUNT, last="7d", end=end),
        )
        assert str(result.interval) == "15min"
        assert result.truncated is False

    async def test_auto_interval_short_period_returns_raw(
        self, ts_service: TimeSeriesService
    ) -> None:
        key = SeriesKey(owner_id="auto-raw-test", metric="temp")
        await ts_service.create_series(
            data_type=DataType.FLOAT, owner_id=key.owner_id, metric=key.metric
        )
        t1 = datetime(2026, 1, 1, 10, 0, tzinfo=UTC)
        t2 = datetime(2026, 1, 1, 11, 0, tzinfo=UTC)
        await ts_service.upsert_points(
            key,
            [DataPoint(timestamp=t1, value=1.0), DataPoint(timestamp=t2, value=2.0)],
        )
        result = await ts_service.get_aggregate(
            key,
            AggregationQuery(
                agg=AggregationOperator.AVG,
                start=datetime(2026, 1, 1, tzinfo=UTC),
                end=datetime(2026, 1, 1, 12, tzinfo=UTC),
            ),
        )
        assert result.interval == "raw"
        assert len(result.points) == 2
        assert all(p.count == 1 for p in result.points)
        assert result.points[0].value == pytest.approx(1.0)
        assert result.points[1].value == pytest.approx(2.0)
        assert result.truncated is False

    async def test_auto_interval_raw_truncated_flag(
        self, ts_service: TimeSeriesService, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        key = SeriesKey(owner_id="auto-trunc-test", metric="temp")
        await ts_service.create_series(
            data_type=DataType.FLOAT, owner_id=key.owner_id, metric=key.metric
        )
        base = datetime(2026, 1, 1, tzinfo=UTC)
        points = [
            DataPoint(timestamp=base + timedelta(minutes=i), value=float(i))
            for i in range(5)
        ]
        await ts_service.upsert_points(key, points)
        # Patch the limit so 5 points triggers truncation
        monkeypatch.setattr("timeseries.service.service.MAX_RAW_LIMIT", 3)
        result = await ts_service.get_aggregate(
            key,
            AggregationQuery(
                agg=AggregationOperator.AVG,
                start=base,
                end=base + timedelta(hours=6),
            ),
        )
        assert result.truncated is True
        assert result.interval == "raw"
        assert len(result.points) == 3

    @pytest.mark.parametrize(
        ("period", "expected_interval"),
        [
            (timedelta(hours=6), None),  # ≤ 24h → raw
            (timedelta(days=1), None),  # boundary: exactly 24h → raw
            (timedelta(days=3), "15min"),  # ≤ 7d → 15min
            (timedelta(days=7), "15min"),  # boundary: exactly 7d → 15min
            (timedelta(days=14), "1h"),  # ≤ 30d → 1h
            (timedelta(days=60), "1d"),  # ≤ 6mo → 1d
            (timedelta(days=365), "1mo"),  # > 6mo → 1mo
        ],
    )
    async def test_auto_interval_resolves_per_period(
        self,
        ts_service: TimeSeriesService,
        period: timedelta,
        expected_interval: str | None,
    ) -> None:
        key = SeriesKey(owner_id="auto-param", metric=str(int(period.total_seconds())))
        await ts_service.create_series(
            data_type=DataType.INT, owner_id=key.owner_id, metric=key.metric
        )
        start = datetime(2026, 1, 1, tzinfo=UTC)
        result = await ts_service.get_aggregate(
            key,
            AggregationQuery(
                agg=AggregationOperator.COUNT,
                start=start,
                end=start + period,
            ),
        )
        if expected_interval is None:
            assert result.interval == "raw"
        else:
            assert str(result.interval) == expected_interval
