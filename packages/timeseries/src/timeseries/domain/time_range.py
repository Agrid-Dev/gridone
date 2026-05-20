from __future__ import annotations

from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

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


def parse_duration_parts(value: str) -> tuple[int, str]:
    """Parse a compact duration string into ``(qty, suffix)``.

    Returns the integer quantity and the raw suffix (e.g. ``15, "min"``).
    Raises :class:`~models.errors.InvalidError` on bad input.
    Supported suffixes: ``min``, ``mo``, ``m``, ``h``, ``d``.
    """
    if not value or len(value) < _MIN_DURATION_LEN:
        msg = f"Invalid duration: {value!r}"
        raise InvalidError(msg)

    for suffix in _MULTI_SUFFIX_MAP:
        if value.endswith(suffix):
            return _parse_amount(value, value[: -len(suffix)]), suffix

    last = value[-1]
    if last not in _SUFFIX_MAP:
        msg = f"Unknown duration suffix {last!r} in {value!r}"
        raise InvalidError(msg)

    return _parse_amount(value, value[:-1]), last


def parse_duration(value: str) -> timedelta:
    """Parse a compact duration string into a timedelta.

    Supported suffixes: ``min`` (minutes), ``mo`` (30-day months),
    ``m`` (minutes), ``h`` (hours), ``d`` (days).
    Examples: ``"15min"``, ``"1mo"``, ``"3h"``, ``"7d"``.
    """
    qty, suffix = parse_duration_parts(value)
    if suffix in _MULTI_SUFFIX_MAP:
        unit, multiplier = _MULTI_SUFFIX_MAP[suffix]
        return timedelta(**{unit: qty * multiplier})
    return timedelta(**{_SUFFIX_MAP[suffix]: qty})


def validate_tz_name(tz: str) -> None:
    """Raise InvalidError if tz is not a recognized IANA timezone key."""
    try:
        ZoneInfo(tz)
    except (ZoneInfoNotFoundError, KeyError):
        msg = f"Unknown IANA timezone: {tz!r}"
        raise InvalidError(msg) from None


def normalize_to_utc(value: datetime | None, tz: str) -> datetime | None:
    """Normalize a datetime to UTC.

    None → None; offset-aware → astimezone(UTC);
    naive → attach ZoneInfo(tz) first, then astimezone(UTC).
    Example: naive 01:00 in Europe/Paris CET → 00:00 UTC.
    """
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=ZoneInfo(tz))
    return value.astimezone(UTC)


def resolve_last(last: str, *, now: datetime | None = None) -> datetime:
    """Return the start timestamp for a relative ``last`` duration."""
    ref = now or datetime.now(UTC)
    return ref - parse_duration(last)
