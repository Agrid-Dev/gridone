import re

duration_seconds = {
    "s": 1,
    "sec": 1,
    "second": 1,
    "seconds": 1,
    "m": 60,
    "min": 60,
    "h": 3600,
    "d": 24 * 3600,
}


def parse_duration(raw_duration: str) -> int:
    """Parses a duration from a string input eg '10s', '1min'.
    Returns value in seconds."""
    match = re.match(r"(\d+)\s*([a-zA-Z]+)", raw_duration.strip().lower())
    if match:
        value, unit = match.groups()
        if unit in duration_seconds:
            result = int(value) * duration_seconds[unit]
            if result <= 0:
                msg = (
                    f"Duration must be positive. {raw_duration} ({result}s) is invalid"
                )
                raise ValueError(msg)
            return result
    msg = f"Unable to parse duration: {raw_duration}"
    raise ValueError(msg)
