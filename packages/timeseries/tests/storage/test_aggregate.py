from datetime import UTC, datetime

import pytest

from timeseries.domain import AggregationOperator, DataPoint, DataType
from timeseries.storage.postgres.aggregate import (
    _anchor_params,
    _base_params,
    _coerce_anchor,
    _mode_query,
    _QueryCtx,
    _simple_query,
    _twavg_query,
    _twmode_query,
)

_START = datetime(2026, 1, 1, tzinfo=UTC)
_END = datetime(2026, 1, 8, tzinfo=UTC)


def _ctx(
    value_col: str = "value_float", anchor_value=None, data_type=DataType.FLOAT
) -> _QueryCtx:
    return _QueryCtx(
        value_col=value_col,
        anchor_value=anchor_value,
        tz="UTC",
        interval_str="1 day",
        series_id="test-id",
        start=_START,
        end=_END,
        data_type=data_type,
    )


class TestCoerceAnchor:
    def test_none_returns_none(self):
        assert _coerce_anchor(AggregationOperator.AVG, None) is None

    @pytest.mark.parametrize(
        "op", [AggregationOperator.AVG, AggregationOperator.TW_AVG]
    )
    def test_avg_ops_coerce_to_float(self, op):
        anchor = DataPoint(timestamp=_START, value=5)
        result = _coerce_anchor(op, anchor)
        assert result == 5.0
        assert isinstance(result, float)

    @pytest.mark.parametrize(
        "op",
        [
            AggregationOperator.COUNT,
            AggregationOperator.SUM,
            AggregationOperator.MIN,
            AggregationOperator.MAX,
            AggregationOperator.FIRST,
            AggregationOperator.LAST,
            AggregationOperator.MODE,
            AggregationOperator.TW_MODE,
        ],
    )
    def test_other_ops_preserve_value(self, op):
        anchor = DataPoint(timestamp=_START, value=42)
        assert _coerce_anchor(op, anchor) == 42


class TestParams:
    def test_base_params_order(self):
        ctx = _ctx()
        params = _base_params(ctx)
        assert params == ["1 day", _START, _END, "UTC", "test-id"]

    def test_anchor_params_appends_anchor(self):
        ctx = _ctx(anchor_value=3.14)
        params = _anchor_params(ctx)
        assert params == ["1 day", _START, _END, "UTC", "test-id", 3.14]
        assert len(params) == 6


class TestSimpleQuery:
    @pytest.mark.parametrize(
        ("op", "data_type"),
        [
            (AggregationOperator.COUNT, DataType.FLOAT),
            (AggregationOperator.SUM, DataType.FLOAT),
            (AggregationOperator.SUM, DataType.INT),
            (AggregationOperator.SUM, DataType.BOOL),
        ],
    )
    def test_no_anchor_ops_use_base_params(self, op, data_type):
        _, params = _simple_query(op, data_type, _ctx())
        assert len(params) == 5

    @pytest.mark.parametrize(
        "op",
        [
            AggregationOperator.AVG,
            AggregationOperator.MIN,
            AggregationOperator.MAX,
            AggregationOperator.FIRST,
            AggregationOperator.LAST,
        ],
    )
    def test_locf_ops_use_anchor_params(self, op):
        _, params = _simple_query(op, DataType.FLOAT, _ctx())
        assert len(params) == 6

    @pytest.mark.parametrize(
        "op",
        [
            AggregationOperator.COUNT,
            AggregationOperator.SUM,
            AggregationOperator.AVG,
            AggregationOperator.MIN,
            AggregationOperator.MAX,
            AggregationOperator.FIRST,
            AggregationOperator.LAST,
        ],
    )
    def test_uses_text_interval_cast(self, op):
        sql, _ = _simple_query(op, DataType.FLOAT, _ctx())
        assert "$1::text::interval" in sql

    @pytest.mark.parametrize(
        "op",
        [
            AggregationOperator.AVG,
            AggregationOperator.MIN,
            AggregationOperator.MAX,
            AggregationOperator.FIRST,
            AggregationOperator.LAST,
        ],
    )
    def test_locf_ops_use_treat_null_as_missing(self, op):
        sql, _ = _simple_query(op, DataType.FLOAT, _ctx())
        assert "treat_null_as_missing => true" in sql

    def test_sum_bool_casts_column_to_int(self):
        sql, _ = _simple_query(
            AggregationOperator.SUM, DataType.BOOL, _ctx("value_boolean")
        )
        assert "value_boolean::int" in sql

    def test_sum_int_returns_bigint(self):
        sql, _ = _simple_query(
            AggregationOperator.SUM, DataType.INT, _ctx("value_integer")
        )
        assert "value_integer" in sql
        assert "::bigint" in sql
        assert "::double precision" not in sql

    def test_sum_float_returns_double_precision(self):
        sql, _ = _simple_query(
            AggregationOperator.SUM, DataType.FLOAT, _ctx("value_float")
        )
        assert "::double precision" in sql

    def test_unknown_op_raises(self):
        with pytest.raises(ValueError, match="does not handle"):
            _simple_query(AggregationOperator.MODE, DataType.FLOAT, _ctx())

    def test_value_column_appears_in_sql(self):
        sql, _ = _simple_query(
            AggregationOperator.AVG, DataType.FLOAT, _ctx("value_float")
        )
        assert "value_float" in sql


class TestModeQuery:
    def test_uses_text_interval_cast(self):
        sql, _ = _mode_query(_ctx())
        assert "$1::text::interval" in sql

    def test_uses_anchor_params(self):
        _, params = _mode_query(_ctx())
        assert len(params) == 6

    def test_mode_val_and_locf_last_raw(self):
        sql, _ = _mode_query(_ctx())
        assert "MAX(value) AS mode_val" in sql
        assert "locf(MAX(last_raw)" in sql

    def test_no_bare_locf_value(self):
        sql, _ = _mode_query(_ctx())
        assert "locf(value," not in sql

    def test_treat_null_as_missing(self):
        sql, _ = _mode_query(_ctx())
        assert "treat_null_as_missing => true" in sql


class TestTwAvgQuery:
    def test_uses_text_interval_cast(self):
        sql, _ = _twavg_query(_ctx())
        assert "$1::text::interval" in sql

    def test_uses_anchor_params(self):
        _, params = _twavg_query(_ctx())
        assert len(params) == 6

    def test_contains_duration_cte(self):
        sql, _ = _twavg_query(_ctx())
        assert "LEAD(timestamp)" in sql
        assert "EXTRACT(EPOCH" in sql

    def test_value_column_cast_to_double_precision(self):
        sql, _ = _twavg_query(_ctx("value_float"))
        assert "value_float::double precision" in sql

    def test_treat_null_as_missing(self):
        sql, _ = _twavg_query(_ctx())
        assert "treat_null_as_missing => true" in sql


class TestTwModeQuery:
    def test_uses_text_interval_cast(self):
        sql, _ = _twmode_query(_ctx())
        assert "$1::text::interval" in sql

    def test_uses_anchor_params(self):
        _, params = _twmode_query(_ctx())
        assert len(params) == 6

    def test_tw_mode_val_and_locf_last_raw(self):
        sql, _ = _twmode_query(_ctx())
        assert "MAX(value) AS tw_mode_val" in sql
        assert "locf(MAX(last_raw)" in sql

    def test_no_bare_locf_value(self):
        sql, _ = _twmode_query(_ctx())
        assert "locf(value," not in sql

    def test_contains_duration_cte(self):
        sql, _ = _twmode_query(_ctx())
        assert "LEAD(timestamp)" in sql

    def test_treat_null_as_missing(self):
        sql, _ = _twmode_query(_ctx())
        assert "treat_null_as_missing => true" in sql
