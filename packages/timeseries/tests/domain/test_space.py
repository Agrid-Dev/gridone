from datetime import UTC, datetime, timedelta

import pytest

from models.errors import InvalidError
from timeseries.domain import (
    AGG_COMPAT,
    SPACE_COMPAT,
    AggregatedPoint,
    AggregationOperator,
    AggregationResult,
    DataType,
    Interval,
    SpaceAggregationResult,
    combine_space,
    fold_space_values,
    resolve_space_aggregation_data_type,
)

_SPACE_OPERATORS = {
    AggregationOperator.AVG,
    AggregationOperator.SUM,
    AggregationOperator.MIN,
    AggregationOperator.MAX,
    AggregationOperator.COUNT,
    AggregationOperator.MODE,
}

T0 = datetime(2026, 7, 1, 0, 0, tzinfo=UTC)
T1 = datetime(2026, 7, 1, 1, 0, tzinfo=UTC)
T2 = datetime(2026, 7, 1, 2, 0, tzinfo=UTC)


def _result(
    values: list[bool | int | float | str | None],
    *,
    agg: AggregationOperator = AggregationOperator.AVG,
    data_type: DataType = DataType.FLOAT,
) -> AggregationResult:
    starts = [T0, T1, T2]
    return AggregationResult(
        interval=Interval.model_validate("1h"),
        agg=agg,
        data_type=data_type,
        timezone="UTC",
        points=[
            AggregatedPoint(interval_start=start, value=v, count=0 if v is None else 1)
            for start, v in zip(starts, values, strict=True)
        ],
    )


class TestSpaceCompatMatrix:
    def test_covers_exactly_the_space_operators(self) -> None:
        assert set(SPACE_COMPAT.keys()) == _SPACE_OPERATORS

    def test_each_operator_covers_all_data_types(self) -> None:
        for op, row in SPACE_COMPAT.items():
            assert set(row.keys()) == set(DataType), f"Missing data types for {op}"

    def test_matches_agg_compat_rows(self) -> None:
        # SPACE_COMPAT is a subset of AGG_COMPAT, not a parallel table.
        for op in _SPACE_OPERATORS:
            assert SPACE_COMPAT[op] == AGG_COMPAT[op]


class TestResolveSpaceAggregationDataType:
    @pytest.mark.parametrize(
        ("op", "data_type", "expected"),
        [
            (AggregationOperator.AVG, DataType.FLOAT, DataType.FLOAT),
            (AggregationOperator.AVG, DataType.BOOL, DataType.FLOAT),
            (AggregationOperator.SUM, DataType.BOOL, DataType.INT),
            (AggregationOperator.SUM, DataType.FLOAT, DataType.FLOAT),
            (AggregationOperator.COUNT, DataType.STRING, DataType.INT),
            (AggregationOperator.MODE, DataType.STRING, DataType.STRING),
            (AggregationOperator.MIN, DataType.INT, DataType.INT),
            (AggregationOperator.MAX, DataType.BOOL, DataType.BOOL),
        ],
    )
    def test_valid_pairs(
        self, op: AggregationOperator, data_type: DataType, expected: DataType
    ) -> None:
        assert resolve_space_aggregation_data_type(op, data_type) == expected

    @pytest.mark.parametrize(
        "op",
        [
            AggregationOperator.FIRST,
            AggregationOperator.LAST,
            AggregationOperator.DELTA,
            AggregationOperator.TW_AVG,
            AggregationOperator.TW_MODE,
        ],
    )
    def test_non_space_operators_rejected(self, op: AggregationOperator) -> None:
        with pytest.raises(InvalidError, match="not a space aggregation operator"):
            resolve_space_aggregation_data_type(op, DataType.FLOAT)

    def test_incompatible_data_type_rejected(self) -> None:
        with pytest.raises(InvalidError, match="not supported for data type"):
            resolve_space_aggregation_data_type(
                AggregationOperator.AVG, DataType.STRING
            )


class TestFoldSpaceValues:
    """Bucket-agnostic: exercised via combine_space above, and directly here
    since it also folds a flat set of values with no time dimension (e.g. a
    KPI's current values across a device set)."""

    def test_sum_of_current_values(self) -> None:
        assert (
            fold_space_values(
                [10.0, 20.0, 30.0], AggregationOperator.SUM, DataType.FLOAT
            )
            == 60.0
        )

    def test_avg_of_current_values(self) -> None:
        assert (
            fold_space_values([10, 20, 30], AggregationOperator.AVG, DataType.FLOAT)
            == 20.0
        )


class TestCombineSpace:
    def test_avg_folds_each_bucket(self) -> None:
        points = combine_space(
            [_result([10.0, 20.0, 30.0]), _result([20.0, 40.0, 50.0])],
            AggregationOperator.AVG,
        )
        assert [(p.interval_start, p.value, p.count) for p in points] == [
            (T0, 15.0, 2),
            (T1, 30.0, 2),
            (T2, 40.0, 2),
        ]

    def test_missing_values_shrink_the_bucket(self) -> None:
        # A series gap-filled to None (device added later) does not
        # contribute; the bucket averages whoever is present.
        points = combine_space(
            [_result([None, None, 30.0]), _result([20.0, 40.0, 50.0])],
            AggregationOperator.AVG,
        )
        assert [(p.value, p.count) for p in points] == [
            (20.0, 1),
            (40.0, 1),
            (40.0, 2),
        ]

    def test_bucket_nobody_covers_stays_empty(self) -> None:
        points = combine_space(
            [_result([None, 1.0, 2.0]), _result([None, 3.0, 4.0])],
            AggregationOperator.AVG,
        )
        assert points[0].value is None
        assert points[0].count == 0

    def test_sum_of_bools_counts_true(self) -> None:
        results = [
            _result(
                [True, False, True],
                agg=AggregationOperator.LAST,
                data_type=DataType.BOOL,
            ),
            _result(
                [True, True, None],
                agg=AggregationOperator.LAST,
                data_type=DataType.BOOL,
            ),
            _result(
                [False, False, False],
                agg=AggregationOperator.LAST,
                data_type=DataType.BOOL,
            ),
        ]
        points = combine_space(results, AggregationOperator.SUM)
        assert [p.value for p in points] == [2, 1, 1]
        assert all(isinstance(p.value, int) for p in points)

    def test_avg_of_bools_is_a_fraction(self) -> None:
        results = [
            _result(
                [True, True, True],
                agg=AggregationOperator.LAST,
                data_type=DataType.BOOL,
            ),
            _result(
                [False, True, True],
                agg=AggregationOperator.LAST,
                data_type=DataType.BOOL,
            ),
        ]
        points = combine_space(results, AggregationOperator.AVG)
        assert [p.value for p in points] == [0.5, 1.0, 1.0]

    def test_mode_picks_predominant_value(self) -> None:
        results = [
            _result(
                ["heat", "cool", "off"],
                agg=AggregationOperator.MODE,
                data_type=DataType.STRING,
            ),
            _result(
                ["heat", "cool", "cool"],
                agg=AggregationOperator.MODE,
                data_type=DataType.STRING,
            ),
            _result(
                ["cool", "cool", "cool"],
                agg=AggregationOperator.MODE,
                data_type=DataType.STRING,
            ),
        ]
        points = combine_space(results, AggregationOperator.MODE)
        assert [p.value for p in points] == ["heat", "cool", "cool"]

    def test_mode_tie_breaks_on_smallest_value(self) -> None:
        results = [
            _result(
                ["heat", "off", "off"],
                agg=AggregationOperator.MODE,
                data_type=DataType.STRING,
            ),
            _result(
                ["cool", "off", "off"],
                agg=AggregationOperator.MODE,
                data_type=DataType.STRING,
            ),
        ]
        points = combine_space(results, AggregationOperator.MODE)
        assert points[0].value == "cool"

    def test_count_min_max(self) -> None:
        results = [_result([10.0, 20.0, None]), _result([30.0, 10.0, 5.0])]
        counts = combine_space(results, AggregationOperator.COUNT)
        assert [p.value for p in counts] == [2, 2, 1]
        mins = combine_space(results, AggregationOperator.MIN)
        assert [p.value for p in mins] == [10.0, 10.0, 5.0]
        maxs = combine_space(results, AggregationOperator.MAX)
        assert [p.value for p in maxs] == [30.0, 20.0, 5.0]

    def test_diverging_grids_merge_by_union(self) -> None:
        shifted = AggregationResult(
            interval=Interval.model_validate("1h"),
            agg=AggregationOperator.AVG,
            data_type=DataType.FLOAT,
            timezone="UTC",
            points=[AggregatedPoint(interval_start=T2, value=7.0, count=1)],
        )
        points = combine_space(
            [_result([1.0, None, None]), shifted], AggregationOperator.AVG
        )
        assert [(p.interval_start, p.value) for p in points] == [
            (T0, 1.0),
            (T1, None),
            (T2, 7.0),
        ]


class TestSpaceAggregationResult:
    def test_aggregation_data_type_chains_time_then_space(self) -> None:
        # last (bool → bool) then avg across devices (bool → float)
        result = SpaceAggregationResult(
            interval=Interval.model_validate("1h"),
            agg=AggregationOperator.LAST,
            space_agg=AggregationOperator.AVG,
            data_type=DataType.BOOL,
            timezone="UTC",
            series_count=2,
            points=[AggregatedPoint(interval_start=T0, value=0.5, count=2)],
        )
        assert result.aggregation_data_type == DataType.FLOAT

    def test_localized_renders_points_in_its_own_timezone(self) -> None:
        result = SpaceAggregationResult(
            interval=Interval.model_validate("1h"),
            agg=AggregationOperator.AVG,
            space_agg=AggregationOperator.AVG,
            data_type=DataType.FLOAT,
            timezone="Europe/Paris",
            series_count=1,
            points=[AggregatedPoint(interval_start=T0, value=1.0, count=1)],
        )

        localized = result.localized()

        point = localized.points[0]
        assert point.interval_start == T0  # same instant
        assert point.interval_start.utcoffset() == timedelta(hours=2)  # CEST
        # The original is untouched — localized() is a copy.
        assert result.points[0].interval_start.utcoffset() == timedelta(0)

    def test_point_values_must_match_output_type(self) -> None:
        with pytest.raises(ValueError, match="does not match"):
            SpaceAggregationResult(
                interval=Interval.model_validate("1h"),
                agg=AggregationOperator.LAST,
                space_agg=AggregationOperator.MODE,
                data_type=DataType.STRING,
                timezone="UTC",
                series_count=1,
                points=[AggregatedPoint(interval_start=T0, value=1.5, count=1)],
            )
