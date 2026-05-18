from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from models.errors import InvalidError
from models.types import DataType
from timeseries.domain.aggregation import (
    AGG_COMPAT,
    AggregatedPoint,
    AggregationOperator,
    AggregationQuery,
    AggregationResult,
    Interval,
    resolve_aggregation_data_type,
)


def _query(**kwargs: object) -> AggregationQuery:
    return AggregationQuery(
        interval=Interval.H_1,
        agg=AggregationOperator.AVG,
        **kwargs,  # type: ignore[arg-type]
    )


class TestInterval:
    def test_members(self):
        assert list(Interval) == ["15min", "1h", "1d", "1mo"]

    @pytest.mark.parametrize("bad", ["15bar", "2h", "1week", "1min", ""])
    def test_invalid_raises(self, bad):
        with pytest.raises(ValidationError):
            AggregationQuery.model_validate({"interval": bad, "agg": "avg"})


class TestAggregationOperator:
    def test_members(self):
        expected = [
            "avg",
            "tw_avg",
            "sum",
            "min",
            "max",
            "first",
            "last",
            "mode",
            "tw_mode",
            "count",
        ]
        assert list(AggregationOperator) == expected

    @pytest.mark.parametrize("bad", ["mean", "median", "stddev", ""])
    def test_invalid_raises(self, bad):
        with pytest.raises(ValidationError):
            AggregationQuery.model_validate({"interval": "1h", "agg": bad})


class TestCompatMatrix:
    def test_covers_all_operators(self):
        assert set(AGG_COMPAT.keys()) == set(AggregationOperator)

    def test_each_operator_covers_all_data_types(self):
        for op, row in AGG_COMPAT.items():
            assert set(row.keys()) == set(DataType), f"Missing data types for {op}"

    @pytest.mark.parametrize(
        ("op", "data_type", "expected"),
        [
            # count -> always int
            ("count", DataType.FLOAT, DataType.INT),
            ("count", DataType.INT, DataType.INT),
            ("count", DataType.BOOL, DataType.INT),
            ("count", DataType.STRING, DataType.INT),
            # first / last / min / max / mode / tw_mode -> identity
            ("first", DataType.FLOAT, DataType.FLOAT),
            ("first", DataType.INT, DataType.INT),
            ("first", DataType.BOOL, DataType.BOOL),
            ("first", DataType.STRING, DataType.STRING),
            ("last", DataType.FLOAT, DataType.FLOAT),
            ("last", DataType.INT, DataType.INT),
            ("last", DataType.BOOL, DataType.BOOL),
            ("last", DataType.STRING, DataType.STRING),
            ("min", DataType.FLOAT, DataType.FLOAT),
            ("min", DataType.INT, DataType.INT),
            ("min", DataType.BOOL, DataType.BOOL),
            ("min", DataType.STRING, DataType.STRING),
            ("max", DataType.FLOAT, DataType.FLOAT),
            ("max", DataType.INT, DataType.INT),
            ("max", DataType.BOOL, DataType.BOOL),
            ("max", DataType.STRING, DataType.STRING),
            ("mode", DataType.FLOAT, DataType.FLOAT),
            ("mode", DataType.INT, DataType.INT),
            ("mode", DataType.BOOL, DataType.BOOL),
            ("mode", DataType.STRING, DataType.STRING),
            ("tw_mode", DataType.FLOAT, DataType.FLOAT),
            ("tw_mode", DataType.INT, DataType.INT),
            ("tw_mode", DataType.BOOL, DataType.BOOL),
            ("tw_mode", DataType.STRING, DataType.STRING),
            # sum: bool -> int, str invalid
            ("sum", DataType.FLOAT, DataType.FLOAT),
            ("sum", DataType.INT, DataType.INT),
            ("sum", DataType.BOOL, DataType.INT),
            # avg / tw_avg: all numeric -> float, str invalid
            ("avg", DataType.FLOAT, DataType.FLOAT),
            ("avg", DataType.INT, DataType.FLOAT),
            ("avg", DataType.BOOL, DataType.FLOAT),
            ("tw_avg", DataType.FLOAT, DataType.FLOAT),
            ("tw_avg", DataType.INT, DataType.FLOAT),
            ("tw_avg", DataType.BOOL, DataType.FLOAT),
        ],
    )
    def test_output_type(self, op, data_type, expected):
        result = resolve_aggregation_data_type(AggregationOperator(op), data_type)
        assert result == expected

    @pytest.mark.parametrize(
        ("op", "data_type"),
        [
            ("sum", DataType.STRING),
            ("avg", DataType.STRING),
            ("tw_avg", DataType.STRING),
        ],
    )
    def test_invalid_combination_raises(self, op, data_type):
        with pytest.raises(InvalidError, match="not supported"):
            resolve_aggregation_data_type(AggregationOperator(op), data_type)


class TestAggregationQuery:
    def test_minimal_defaults(self):
        q = _query()
        assert q.start is None
        assert q.end is None
        assert q.last is None
        assert q.timezone is None

    def test_full_valid(self):
        q = AggregationQuery(
            interval=Interval.D_1,
            agg=AggregationOperator.SUM,
            start=datetime(2026, 1, 1, tzinfo=UTC),
            end=datetime(2026, 2, 1, tzinfo=UTC),
            timezone="Europe/Paris",
        )
        assert q.timezone == "Europe/Paris"

    def test_last_explicit_none(self):
        q = _query(last=None)
        assert q.last is None

    def test_timezone_explicit_none(self):
        q = _query(timezone=None)
        assert q.timezone is None

    @pytest.mark.parametrize("good_last", ["7d", "15min", "1mo", "3h"])
    def test_last_valid(self, good_last):
        q = _query(last=good_last)
        assert q.last == good_last

    @pytest.mark.parametrize("bad_last", ["7y", "abc", "0d", "-1h"])
    def test_last_invalid_raises(self, bad_last):
        with pytest.raises(ValidationError):
            _query(last=bad_last)

    @pytest.mark.parametrize("bad_tz", ["Mars/Olympus", "Europe/Fakeville", "notazone"])
    def test_invalid_timezone_raises(self, bad_tz):
        with pytest.raises(ValidationError):
            _query(timezone=bad_tz)

    @pytest.mark.parametrize(
        "good_tz", ["UTC", "Europe/Paris", "America/New_York", "Asia/Tokyo"]
    )
    def test_valid_timezone_accepted(self, good_tz):
        assert _query(timezone=good_tz).timezone == good_tz

    def test_start_equal_end_raises(self):
        t = datetime(2026, 1, 1, tzinfo=UTC)
        with pytest.raises(ValidationError, match="start must be before end"):
            _query(start=t, end=t)

    def test_start_after_end_raises(self):
        with pytest.raises(ValidationError, match="start must be before end"):
            _query(
                start=datetime(2026, 2, 1, tzinfo=UTC),
                end=datetime(2026, 1, 1, tzinfo=UTC),
            )

    def test_start_before_end_valid(self):
        q = _query(
            start=datetime(2026, 1, 1, tzinfo=UTC),
            end=datetime(2026, 1, 2, tzinfo=UTC),
        )
        assert q.start < q.end  # type: ignore[operator]

    def test_only_start_valid(self):
        q = _query(start=datetime(2026, 1, 1, tzinfo=UTC))
        assert q.start is not None
        assert q.end is None

    def test_only_end_valid(self):
        q = _query(end=datetime(2026, 1, 1, tzinfo=UTC))
        assert q.end is not None
        assert q.start is None

    def test_mixed_naive_and_aware_does_not_raise(self):
        # Service normalizes both before use; validator must not crash on comparison
        naive_start = datetime(2026, 1, 16, 1, 0, 0, tzinfo=UTC).replace(tzinfo=None)
        q = _query(
            start=naive_start,
            end=datetime(2026, 1, 16, 12, 0, 0, tzinfo=UTC),
        )
        assert q.start is not None
        assert q.end is not None


class TestAggregatedPoint:
    @pytest.mark.parametrize("value", [42, 3.14, True, "hello", None])
    def test_value_types(self, value):
        p = AggregatedPoint(
            interval_start=datetime(2026, 1, 1, tzinfo=UTC),
            value=value,
            count=1,
        )
        assert p.value == value

    def test_count_zero_for_locf(self):
        p = AggregatedPoint(
            interval_start=datetime(2026, 1, 1, tzinfo=UTC),
            value=10.5,
            count=0,
        )
        assert p.count == 0


class TestAggregationResult:
    def test_creation(self):
        point = AggregatedPoint(
            interval_start=datetime(2026, 1, 1, tzinfo=UTC), value=19.5, count=4
        )
        result = AggregationResult(
            interval=Interval.H_1,
            agg=AggregationOperator.AVG,
            data_type=DataType.FLOAT,
            timezone="UTC",
            points=[point],
        )
        assert result.points == [point]
        assert result.aggregation_data_type == DataType.FLOAT

    def test_avg_bool_yields_float_aggregation_type(self):
        result = AggregationResult(
            interval=Interval.MO_1,
            agg=AggregationOperator.AVG,
            data_type=DataType.BOOL,
            timezone="UTC",
            points=[],
        )
        assert result.data_type == DataType.BOOL
        assert result.aggregation_data_type == DataType.FLOAT

    def test_point_value_type_mismatch_raises(self):
        point = AggregatedPoint(
            interval_start=datetime(2026, 1, 1, tzinfo=UTC),
            value="not_a_float",
            count=1,
        )
        with pytest.raises(ValidationError, match="aggregation_data_type"):
            AggregationResult(
                interval=Interval.H_1,
                agg=AggregationOperator.AVG,
                data_type=DataType.FLOAT,
                timezone="UTC",
                points=[point],
            )

    def test_none_value_allowed_for_any_type(self):
        point = AggregatedPoint(
            interval_start=datetime(2026, 1, 1, tzinfo=UTC), value=None, count=0
        )
        result = AggregationResult(
            interval=Interval.H_1,
            agg=AggregationOperator.AVG,
            data_type=DataType.FLOAT,
            timezone="UTC",
            points=[point],
        )
        assert result.points[0].value is None
