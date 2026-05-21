import pytest

from timeseries.domain.aggregation import Interval, IntervalUnit
from timeseries.storage.postgres.aggregate import _to_sql_interval


@pytest.mark.parametrize(
    ("interval_str", "expected"),
    [
        ("15min", "15 minutes"),
        ("1h", "1 hour"),
        ("7d", "7 day"),
        ("1mo", "1 month"),
        ("30min", "30 minutes"),
        ("2h", "2 hour"),
        ("3d", "3 day"),
    ],
)
def test_to_sql_interval(interval_str: str, expected: str) -> None:
    assert _to_sql_interval(Interval.model_validate(interval_str)) == expected


@pytest.mark.parametrize(
    ("qty", "unit", "expected"),
    [
        (1, IntervalUnit.MIN, "1 minutes"),
        (1, IntervalUnit.H, "1 hour"),
        (1, IntervalUnit.D, "1 day"),
        (1, IntervalUnit.MO, "1 month"),
    ],
)
def test_to_sql_interval_all_units(qty: int, unit: IntervalUnit, expected: str) -> None:
    iv = Interval(qty=qty, unit=unit)
    assert _to_sql_interval(iv) == expected
