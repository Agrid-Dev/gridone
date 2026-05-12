import os
from collections.abc import AsyncIterator
from datetime import datetime
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
                pytest.mark.xfail(
                    strict=False,
                    reason="postgres aggregate not yet implemented",
                ),
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
    url = None if request.param == "memory" else os.environ["POSTGRES_TEST_URL"]
    service = TimeSeriesService(url)
    await service.start()
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


@pytest.mark.xfail(
    strict=False, reason="storage backends do not yet implement aggregate"
)
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

    @pytest.mark.xfail(
        strict=False, reason="storage backends do not yet implement aggregate"
    )
    async def test_last_resolved_to_start(self, ts_service: TimeSeriesService) -> None:
        key = SeriesKey(owner_id="test", metric="ts_last")
        await ts_service.create_series(
            data_type=DataType.INT, owner_id=key.owner_id, metric=key.metric
        )
        result = await ts_service.get_aggregate(
            key,
            AggregationQuery(
                agg=AggregationOperator.COUNT, interval=Interval.D_1, last="7d"
            ),
        )
        assert result is not None
