import os
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from pathlib import Path

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
async def test_aggregate(ts_service: TimeSeriesService, case_name: str) -> None:
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
                AggregationQuery(agg=AggregationOperator.AVG, interval=Interval.D_1),
            )

    async def test_series_not_found_raises(self, ts_service: TimeSeriesService) -> None:
        key = SeriesKey(owner_id="test", metric="nonexistent")
        with pytest.raises(NotFoundError):
            await ts_service.get_aggregate(
                key,
                AggregationQuery(agg=AggregationOperator.COUNT, interval=Interval.D_1),
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
                interval=Interval.D_1,
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
                    interval=Interval.D_1,
                    start=now,
                ),
            )
        with pytest.raises(InvalidError):
            await ts_service.get_aggregate(
                key,
                AggregationQuery(
                    agg=AggregationOperator.COUNT,
                    interval=Interval.D_1,
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
                    interval=Interval.D_1,
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
                    interval=Interval.D_1,
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
                    interval=Interval.D_1,
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
                datetime(2026, 1, 16, 1, 0, 0, tzinfo=UTC).replace(tzinfo=None),
                "Europe/Paris",
                datetime(2026, 1, 16, 0, 30, 0, tzinfo=UTC),
                datetime(2026, 1, 15, 23, 30, 0, tzinfo=UTC),
            ),
            # Paris CEST (UTC+2): naive 01:00 → 23:00 UTC prev day
            (
                datetime(2026, 7, 16, 1, 0, 0, tzinfo=UTC).replace(tzinfo=None),
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
            result = await svc.get_aggregate(
                key,
                AggregationQuery(
                    agg=AggregationOperator.COUNT,
                    interval=Interval.D_1,
                    start=naive_start,
                    end=end,
                ),
            )
            total = sum(p.count for p in result.points)
            assert total == 1
        finally:
            await svc.stop()
