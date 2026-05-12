from __future__ import annotations

from datetime import UTC, datetime, timedelta

from models.errors import InvalidError

_SUFFIX_MAP: dict[str, str] = {
    "m": "minutes",
    "h": "hours",
    "d": "days",
}

# Multi-character suffixes checked before single-char to avoid partial matches.
# "mo" maps to days using a 30-day approximation; "min" maps directly to minutes.
_MULTI_SUFFIX_MAP: dict[str, tuple[str, int]] = {
    "min": ("minutes", 1),
    "mo": ("days", 30),
}

_MIN_DURATION_LEN = 2


def _parse_amount(value: str, numeric: str) -> int:
    try:
        amount = int(numeric)
    except ValueError:
        msg = f"Invalid numeric part in duration {value!r}"
        raise InvalidError(msg) from None
    if amount <= 0:
        msg = f"Duration must be positive, got {value!r}"
        raise InvalidError(msg)
    return amount


def parse_duration(value: str) -> timedelta:
    """Parse a compact duration string into a timedelta.

    Supported suffixes: ``min`` (minutes), ``mo`` (30-day months),
    ``m`` (minutes), ``h`` (hours), ``d`` (days).
    Examples: ``"15min"``, ``"1mo"``, ``"3h"``, ``"7d"``.
    """
    if not value or len(value) < _MIN_DURATION_LEN:
        msg = f"Invalid duration: {value!r}"
        raise InvalidError(msg)

    for suffix, (unit, multiplier) in _MULTI_SUFFIX_MAP.items():
        if value.endswith(suffix):
            amount = _parse_amount(value, value[: -len(suffix)])
            return timedelta(**{unit: amount * multiplier})

    unit = _SUFFIX_MAP.get(value[-1])
    if unit is None:
        msg = f"Unknown duration suffix {value[-1]!r} in {value!r}"
        raise InvalidError(msg)

    amount = _parse_amount(value, value[:-1])
    return timedelta(**{unit: amount})


def resolve_last(last: str, *, now: datetime | None = None) -> datetime:
    """Return the start timestamp for a relative ``last`` duration."""
    ref = now or datetime.now(UTC)
    return ref - parse_duration(last)
