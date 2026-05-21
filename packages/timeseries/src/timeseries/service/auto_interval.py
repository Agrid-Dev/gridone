from datetime import timedelta

from timeseries.domain.aggregation import Interval
from timeseries.domain.time_range import parse_duration

MIN_BUCKETS = 2
MAX_BUCKETS = 1000

CANONICAL_INTERVALS: list[Interval] = [
    Interval.model_validate("15min"),
    Interval.model_validate("1h"),
    Interval.model_validate("1d"),
    Interval.model_validate("1mo"),
]

_LOOKUP_DATA: list[tuple[str | None, str | None]] = [
    ("24h", None),
    ("7d", "15min"),
    ("30d", "1h"),
    ("6mo", "1d"),
    (None, "1mo"),
]

AUTO_INTERVAL_LOOKUP: list[tuple[str | None, timedelta | None, Interval | None]] = [
    (
        max_str,
        parse_duration(max_str) if max_str is not None else None,
        Interval.model_validate(interval_str) if interval_str is not None else None,
    )
    for max_str, interval_str in _LOOKUP_DATA
]


def resolve_auto_interval(period: timedelta) -> Interval | None:
    """Walk the lookup top-down; return the first matching interval (None = raw).

    Example: ``timedelta(days=3)`` → ``Interval("15min")``.
    """
    for _display, max_td, interval in AUTO_INTERVAL_LOOKUP:
        if max_td is None or period <= max_td:
            return interval
    msg = "unreachable — last entry is the catch-all"
    raise AssertionError(msg)


def valid_intervals_for_period(period: timedelta) -> list[Interval | None]:
    """Return intervals whose bucket count falls in [MIN_BUCKETS, MAX_BUCKETS].

    None (raw) is always included first. Iterates CANONICAL_INTERVALS in order.
    Example: ``timedelta(days=7)`` → ``[None, Interval("15min"), Interval("1h"), …]``.
    """
    valid: list[Interval | None] = [None]
    for interval in CANONICAL_INTERVALS:
        bucket_count = period / interval.to_timedelta()
        if MIN_BUCKETS <= bucket_count <= MAX_BUCKETS:
            valid.append(interval)
    return valid
