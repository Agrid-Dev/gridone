from __future__ import annotations

from datetime import UTC, datetime, timedelta

from models.errors import InvalidError

_SUFFIX_MAP: dict[str, str] = {
    "m": "minutes",
    "h": "hours",
    "d": "days",
}

_MIN_DURATION_LEN = 2


def parse_duration(value: str) -> timedelta:
    """Parse a compact duration string (e.g. ``"3h"``, ``"7d"``) into a timedelta.

    Supported suffixes: ``m`` (minutes), ``h`` (hours), ``d`` (days).
    """
    if not value or len(value) < _MIN_DURATION_LEN:
        msg = f"Invalid duration: {value!r}"
        raise InvalidError(msg)

    suffix = value[-1]
    unit = _SUFFIX_MAP.get(suffix)
    if unit is None:
        msg = f"Unknown duration suffix {suffix!r} in {value!r}"
        raise InvalidError(msg)

    try:
        amount = int(value[:-1])
    except ValueError:
        msg = f"Invalid numeric part in duration {value!r}"
        raise InvalidError(msg) from None

    if amount <= 0:
        msg = f"Duration must be positive, got {value!r}"
        raise InvalidError(msg)

    return timedelta(**{unit: amount})


def resolve_last(last: str, *, now: datetime | None = None) -> datetime:
    """Return the start timestamp for a relative ``last`` duration."""
    ref = now or datetime.now(UTC)
    return ref - parse_duration(last)
