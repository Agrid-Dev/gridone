from __future__ import annotations

from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from models.errors import InvalidError
from timeseries.domain import normalize_to_utc, parse_duration, resolve_last


class TestParseDuration:
    @pytest.mark.parametrize(
        ("value", "expected"),
        [
            ("10m", timedelta(minutes=10)),
            ("30m", timedelta(minutes=30)),
            ("15min", timedelta(minutes=15)),
            ("1h", timedelta(hours=1)),
            ("3h", timedelta(hours=3)),
            ("12h", timedelta(hours=12)),
            ("1d", timedelta(days=1)),
            ("7d", timedelta(days=7)),
            ("1mo", timedelta(days=30)),
            ("3mo", timedelta(days=90)),
        ],
    )
    def test_known_durations(self, value: str, expected: timedelta):
        assert parse_duration(value) == expected

    @pytest.mark.parametrize(
        "value",
        ["", "x", "3x", "abc", "h", "0h", "-1d", "abch", "abcmin", "0mo", "-1min"],
    )
    def test_invalid_input_raises(self, value: str):
        with pytest.raises(InvalidError):
            parse_duration(value)


class TestNormalizeToUtc:
    def test_none_returns_none(self):
        assert normalize_to_utc(None, "UTC") is None

    def test_aware_utc_passthrough(self):
        dt = datetime(2026, 1, 15, 10, 0, 0, tzinfo=UTC)
        result = normalize_to_utc(dt, "Europe/Paris")
        assert result is not None
        assert result == dt
        assert result.tzinfo is UTC

    def test_aware_paris_converted_to_utc(self):
        paris = ZoneInfo("Europe/Paris")
        dt = datetime(2026, 1, 15, 11, 0, 0, tzinfo=paris)  # CET = UTC+1
        result = normalize_to_utc(dt, "UTC")
        assert result == datetime(2026, 1, 15, 10, 0, 0, tzinfo=UTC)

    @pytest.mark.parametrize(
        ("naive_local", "tz", "expected_utc"),
        [
            # Winter: Paris CET = UTC+1 → naive 01:00 → 00:00 UTC
            (
                datetime(2026, 1, 16, 1, 0, 0, tzinfo=UTC).replace(tzinfo=None),
                "Europe/Paris",
                datetime(2026, 1, 16, 0, 0, 0, tzinfo=UTC),
            ),
            # Summer: Paris CEST = UTC+2 → naive 01:00 → 23:00 UTC previous day
            (
                datetime(2026, 7, 16, 1, 0, 0, tzinfo=UTC).replace(tzinfo=None),
                "Europe/Paris",
                datetime(2026, 7, 15, 23, 0, 0, tzinfo=UTC),
            ),
            # UTC: naive in UTC stays the same
            (
                datetime(2026, 6, 1, 12, 0, 0, tzinfo=UTC).replace(tzinfo=None),
                "UTC",
                datetime(2026, 6, 1, 12, 0, 0, tzinfo=UTC),
            ),
        ],
    )
    def test_naive_attached_to_zone_then_utc(
        self, naive_local: datetime, tz: str, expected_utc: datetime
    ):
        result = normalize_to_utc(naive_local, tz)
        assert result == expected_utc


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
