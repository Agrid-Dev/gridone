import pytest
from core.driver.driver_schema.parse_duration import parse_duration


@pytest.mark.parametrize(
    ("raw_duration", "expected"),
    [
        ("10s", 10),
        ("1min", 60),
        ("1h", 3600),
        ("1d", 24 * 3600),
        ("  10 sec ", 10),
    ],
)
def test_parse_duration(raw_duration: str, expected: int) -> None:
    assert parse_duration(raw_duration) == expected


@pytest.mark.parametrize(
    ("invalid_raw_duration"), [("s"), ("abc"), (""), ("-2s"), ("0s"), ("10")]
)
def test_parse_duration_invalid_input(invalid_raw_duration: str) -> None:
    with pytest.raises(ValueError):  # noqa: PT011
        parse_duration(invalid_raw_duration)
