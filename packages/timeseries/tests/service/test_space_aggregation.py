"""Service-level space aggregation, run against both backends.

Scenarios mirror the issue's use cases: average temperature over
thermostats, count of thermostats ON, predominant HVAC mode — plus the
different-bounds requirement (a device whose history starts mid-window).
"""

from datetime import UTC, datetime

import pytest

from models.errors import InvalidError, NotFoundError
from timeseries.domain import (
    AggregationOperator,
    AggregationQuery,
    AttributeValueType,
    DataPoint,
    DataType,
    SeriesKey,
)
from timeseries.service import TimeSeriesService

pytestmark = pytest.mark.asyncio

START = datetime(2026, 7, 1, 0, 0, tzinfo=UTC)
END = datetime(2026, 7, 1, 3, 0, tzinfo=UTC)
B0 = datetime(2026, 7, 1, 0, 0, tzinfo=UTC)
B1 = datetime(2026, 7, 1, 1, 0, tzinfo=UTC)
B2 = datetime(2026, 7, 1, 2, 0, tzinfo=UTC)


def _at(hour: int, minute: int) -> datetime:
    return datetime(2026, 7, 1, hour, minute, tzinfo=UTC)


async def _seed(
    ts: TimeSeriesService,
    owner: str,
    data_type: DataType,
    points: list[tuple[datetime, AttributeValueType]],
) -> SeriesKey:
    key = SeriesKey(owner_id=owner, metric="attr")
    await ts.create_series(data_type=data_type, owner_id=key.owner_id, metric="attr")
    await ts.upsert_points(key, [DataPoint(timestamp=t, value=v) for t, v in points])
    return key


def _query(agg: AggregationOperator, interval: str = "1h") -> AggregationQuery:
    # Validated from the wire form: interval arrives as a string ("1h", "raw",
    # "whole") and the model parses it, exactly as the API layer feeds it.
    return AggregationQuery.model_validate(
        {"agg": agg, "interval": interval, "start": START, "end": END}
    )


class TestGetAggregateMany:
    async def test_avg_temperature_over_thermostats(
        self, ts_service: TimeSeriesService
    ) -> None:
        keys = [
            await _seed(
                ts_service,
                "t1",
                DataType.FLOAT,
                [(_at(0, 10), 10.0), (_at(1, 10), 20.0), (_at(2, 10), 30.0)],
            ),
            await _seed(
                ts_service,
                "t2",
                DataType.FLOAT,
                [(_at(0, 20), 20.0), (_at(1, 20), 40.0), (_at(2, 20), 50.0)],
            ),
        ]
        result = await ts_service.get_aggregate_many(
            keys, _query(AggregationOperator.AVG), AggregationOperator.AVG
        )
        assert result.series_count == 2
        assert result.space_agg == AggregationOperator.AVG
        assert result.aggregation_data_type == DataType.FLOAT
        assert [(p.interval_start, p.value, p.count) for p in result.points] == [
            (B0, 15.0, 2),
            (B1, 30.0, 2),
            (B2, 40.0, 2),
        ]

    async def test_device_added_mid_window_joins_late(
        self, ts_service: TimeSeriesService
    ) -> None:
        keys = [
            await _seed(
                ts_service,
                "old",
                DataType.FLOAT,
                [(_at(0, 10), 10.0), (_at(1, 10), 20.0), (_at(2, 10), 30.0)],
            ),
            await _seed(ts_service, "new", DataType.FLOAT, [(_at(2, 5), 50.0)]),
        ]
        result = await ts_service.get_aggregate_many(
            keys, _query(AggregationOperator.AVG), AggregationOperator.AVG
        )
        assert [(p.value, p.count) for p in result.points] == [
            (10.0, 1),
            (20.0, 1),
            (40.0, 2),
        ]

    async def test_count_of_thermostats_on(self, ts_service: TimeSeriesService) -> None:
        # `last` per bucket carries a silent thermostat's state forward, so a
        # device that reported once still counts in every later bucket.
        keys = [
            await _seed(
                ts_service,
                "t1",
                DataType.BOOL,
                [(_at(0, 5), True), (_at(1, 5), False)],
            ),
            await _seed(ts_service, "t2", DataType.BOOL, [(_at(0, 30), True)]),
            await _seed(
                ts_service,
                "t3",
                DataType.BOOL,
                [(_at(0, 10), False), (_at(2, 10), True)],
            ),
        ]
        result = await ts_service.get_aggregate_many(
            keys, _query(AggregationOperator.LAST), AggregationOperator.SUM
        )
        assert result.aggregation_data_type == DataType.INT
        assert [p.value for p in result.points] == [2, 1, 2]

    async def test_predominant_hvac_mode(self, ts_service: TimeSeriesService) -> None:
        keys = [
            await _seed(
                ts_service,
                "t1",
                DataType.STRING,
                [(_at(0, 5), "heat"), (_at(1, 5), "cool")],
            ),
            await _seed(ts_service, "t2", DataType.STRING, [(_at(0, 10), "heat")]),
            await _seed(
                ts_service,
                "t3",
                DataType.STRING,
                [(_at(0, 20), "cool"), (_at(2, 0), "cool")],
            ),
        ]
        result = await ts_service.get_aggregate_many(
            keys, _query(AggregationOperator.MODE), AggregationOperator.MODE
        )
        assert result.aggregation_data_type == DataType.STRING
        assert [p.value for p in result.points] == ["heat", "cool", "cool"]

    async def test_whole_interval_yields_one_bucket(
        self, ts_service: TimeSeriesService
    ) -> None:
        keys = [
            await _seed(ts_service, "m1", DataType.FLOAT, [(_at(1, 0), 100.0)]),
            await _seed(ts_service, "m2", DataType.FLOAT, [(_at(2, 0), 250.0)]),
        ]
        result = await ts_service.get_aggregate_many(
            keys,
            _query(AggregationOperator.SUM, interval="whole"),
            AggregationOperator.SUM,
        )
        assert len(result.points) == 1
        assert result.points[0].value == 350.0

    async def test_keys_without_series_are_skipped(
        self, ts_service: TimeSeriesService
    ) -> None:
        keys = [
            await _seed(ts_service, "t1", DataType.FLOAT, [(_at(0, 10), 10.0)]),
            SeriesKey(owner_id="never-recorded", metric="attr"),
        ]
        result = await ts_service.get_aggregate_many(
            keys, _query(AggregationOperator.AVG), AggregationOperator.AVG
        )
        assert result.series_count == 1

    async def test_no_series_at_all_raises_not_found(
        self, ts_service: TimeSeriesService
    ) -> None:
        with pytest.raises(NotFoundError, match="No timeseries found"):
            await ts_service.get_aggregate_many(
                [SeriesKey(owner_id="ghost", metric="attr")],
                _query(AggregationOperator.AVG),
                AggregationOperator.AVG,
            )

    async def test_mixed_data_types_rejected(
        self, ts_service: TimeSeriesService
    ) -> None:
        keys = [
            await _seed(ts_service, "t1", DataType.FLOAT, [(_at(0, 10), 10.0)]),
            await _seed(ts_service, "t2", DataType.BOOL, [(_at(0, 10), True)]),
        ]
        with pytest.raises(InvalidError, match="mixed data types"):
            await ts_service.get_aggregate_many(
                keys, _query(AggregationOperator.LAST), AggregationOperator.COUNT
            )

    async def test_raw_interval_rejected(self, ts_service: TimeSeriesService) -> None:
        keys = [await _seed(ts_service, "t1", DataType.FLOAT, [(_at(0, 10), 10.0)])]
        with pytest.raises(InvalidError, match="'raw' is not supported"):
            await ts_service.get_aggregate_many(
                keys,
                _query(AggregationOperator.AVG, interval="raw"),
                AggregationOperator.AVG,
            )

    async def test_non_space_operator_rejected(
        self, ts_service: TimeSeriesService
    ) -> None:
        keys = [await _seed(ts_service, "t1", DataType.FLOAT, [(_at(0, 10), 10.0)])]
        with pytest.raises(InvalidError, match="not a space aggregation operator"):
            await ts_service.get_aggregate_many(
                keys, _query(AggregationOperator.AVG), AggregationOperator.DELTA
            )

    async def test_space_operator_incompatible_with_type_rejected(
        self, ts_service: TimeSeriesService
    ) -> None:
        keys = [await _seed(ts_service, "t1", DataType.STRING, [(_at(0, 10), "on")])]
        with pytest.raises(InvalidError, match="not supported for data type"):
            await ts_service.get_aggregate_many(
                keys, _query(AggregationOperator.MODE), AggregationOperator.SUM
            )
