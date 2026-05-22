from datetime import timedelta

import pytest

from models.errors import InvalidError
from timeseries.service.auto_interval import (
    MAX_BUCKETS,
    MIN_BUCKETS,
    TARGET_BUCKETS,
    resolve_auto_interval,
    valid_intervals_for_period,
)


class TestResolveAutoInterval:
    @pytest.mark.parametrize(
        ("period", "expected"),
        [
            # < MIN_BUCKETS * 15min (30min) → no valid interval → raw
            (timedelta(minutes=20), "raw"),
            (timedelta(minutes=29), "raw"),  # just below 30min boundary → raw
            (timedelta(minutes=30), "15min"),  # exactly 2 * 15min = MIN_BUCKETS → valid
            # 15min is closest to TARGET_BUCKETS for short periods
            (timedelta(hours=1), "15min"),  # 1h → 4 buckets (15min), closest to 200
            (timedelta(hours=6), "15min"),  # 6h → 24 buckets (15min)
            (
                timedelta(hours=24),
                "15min",
            ),  # 24h → 96 buckets (15min), diff=104 < 1h diff=176
            (timedelta(days=3), "15min"),  # 3d → 288 buckets (15min), closest to 200
            # crossover 15min→1h near ~3.3 days (80h)
            (
                timedelta(days=4),
                "1h",
            ),  # 4d → 96 buckets (1h), closer to 200 than 15min(384)
            (
                timedelta(days=7),
                "1h",
            ),  # 7d → 168 buckets (1h), diff=32 < 15min diff=472
            (
                timedelta(days=14),
                "1h",
            ),  # 14d → 336 buckets (1h), diff=136 < 1d diff=186
            # crossover 1h→1d near ~16 days
            (
                timedelta(days=30),
                "1d",
            ),  # 30d → 30 buckets (1d), closer to 200 than 1h(720>MAX)
            (timedelta(days=180), "1d"),  # 180d → 180 buckets (1d), diff=20
            (
                timedelta(days=365),
                "1d",
            ),  # 1yr → 365 buckets (1d), diff=165 < 1mo diff=188
            # crossover 1d→1mo near ~387 days
            (timedelta(days=400), "1mo"),  # 400d → ~13.3 buckets (1mo), closest to 200
        ],
    )
    def test_resolve_auto_interval(self, period: timedelta, expected: str) -> None:
        assert resolve_auto_interval(period) == expected

    def test_raises_on_zero_period(self) -> None:
        with pytest.raises(InvalidError, match="positive"):
            resolve_auto_interval(timedelta(0))

    def test_raises_on_negative_period(self) -> None:
        with pytest.raises(InvalidError, match="positive"):
            resolve_auto_interval(timedelta(days=-1))

    def test_constants_are_sane(self) -> None:
        assert MIN_BUCKETS < TARGET_BUCKETS < MAX_BUCKETS


class TestValidIntervalsForPeriod:
    @pytest.mark.parametrize(
        ("period", "expected"),
        [
            (timedelta(hours=1), ["raw", "15min"]),
            (timedelta(hours=24), ["raw", "15min", "1h"]),
            (timedelta(days=7), ["raw", "15min", "1h", "1d"]),
            (timedelta(days=11), ["raw", "1h", "1d"]),
            (timedelta(days=30), ["raw", "1h", "1d"]),
            (timedelta(days=180), ["raw", "1d", "1mo"]),
            (timedelta(days=365), ["raw", "1d", "1mo"]),
        ],
    )
    def test_valid_intervals_for_period(
        self, period: timedelta, expected: list[str]
    ) -> None:
        assert valid_intervals_for_period(period) == expected

    def test_raises_on_zero_period(self) -> None:
        with pytest.raises(InvalidError, match="positive"):
            valid_intervals_for_period(timedelta(0))

    def test_raises_on_negative_period(self) -> None:
        with pytest.raises(InvalidError, match="positive"):
            valid_intervals_for_period(timedelta(days=-1))
