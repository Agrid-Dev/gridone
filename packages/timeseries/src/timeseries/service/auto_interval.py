from datetime import timedelta

from models.errors import InvalidError
from timeseries.domain.time_range import parse_duration

MIN_BUCKETS = 2
MAX_BUCKETS = 1000
TARGET_BUCKETS = 200

CANONICAL_INTERVALS: list[str] = ["15min", "1h", "1d", "1mo"]

_CANONICAL_TIMEDELTAS: list[timedelta] = [
    parse_duration(iv) for iv in CANONICAL_INTERVALS
]
_RAW_MAX_PERIOD: timedelta = MAX_BUCKETS * _CANONICAL_TIMEDELTAS[0]


def resolve_auto_interval(period: timedelta) -> str:
    """Return the canonical interval string closest to TARGET_BUCKETS buckets.

    Returns "raw" when no canonical interval yields MIN_BUCKETS..MAX_BUCKETS buckets.
    """
    if period <= timedelta(0):
        msg = "period must be positive"
        raise InvalidError(msg)
    best: str | None = None
    best_diff = float("inf")
    for iv_str, iv_td in zip(CANONICAL_INTERVALS, _CANONICAL_TIMEDELTAS, strict=True):
        bucket_count = period / iv_td
        if MIN_BUCKETS <= bucket_count <= MAX_BUCKETS:
            diff = abs(bucket_count - TARGET_BUCKETS)
            if diff < best_diff:
                best_diff = diff
                best = iv_str
    return best if best is not None else "raw"


def valid_intervals_for_period(period: timedelta) -> list[str]:
    """Return interval strings whose bucket count falls in [MIN_BUCKETS, MAX_BUCKETS].

    "raw" is included first only when period <= MAX_BUCKETS * 15min (~10.4 days).
    Raises InvalidError when period <= 0.
    Example: timedelta(days=7) → ["raw", "15min", "1h", "1d"].
    """
    if period <= timedelta(0):
        msg = "period must be positive"
        raise InvalidError(msg)
    valid: list[str] = []
    if period <= _RAW_MAX_PERIOD:
        valid.append("raw")
    for iv_str, iv_td in zip(CANONICAL_INTERVALS, _CANONICAL_TIMEDELTAS, strict=True):
        bucket_count = period / iv_td
        if MIN_BUCKETS <= bucket_count <= MAX_BUCKETS:
            valid.append(iv_str)
    return valid
