from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from models.errors import InvalidError
from timeseries.domain import parse_duration, resolve_last


class TestParseDuration:
    @pytest.mark.parametrize(
        ("value", "expected"),
        [
            ("10m", timedelta(minutes=10)),
            ("30m", timedelta(minutes=30)),
            ("1h", timedelta(hours=1)),
            ("3h", timedelta(hours=3)),
            ("12h", timedelta(hours=12)),
            ("1d", timedelta(days=1)),
            ("7d", timedelta(days=7)),
        ],
    )
    def test_known_durations(self, value: str, expected: timedelta):
        assert parse_duration(value) == expected

    @pytest.mark.parametrize("value", ["", "x", "3x", "abc", "h", "0h", "-1d"])
    def test_invalid_input_raises(self, value: str):
        with pytest.raises(InvalidError):
            parse_duration(value)


class TestResolveLast:
    def test_with_fixed_now(self):
        now = datetime(2026, 2, 25, 12, 0, 0, tzinfo=UTC)
        result = resolve_last("3h", now=now)
        assert result == datetime(2026, 2, 25, 9, 0, 0, tzinfo=UTC)

    def test_defaults_to_utc_now(self):
        before = datetime.now(UTC)
        result = resolve_last("1h")
        after = datetime.now(UTC)
        assert before - timedelta(hours=1) <= result <= after - timedelta(hours=1)
