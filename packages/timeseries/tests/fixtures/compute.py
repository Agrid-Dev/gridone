"""Compute expected aggregation values and write fixture case YAML files."""

import shutil
from collections import defaultdict
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import yaml

INPUTS_DIR = Path(__file__).parent / "inputs"
CASES_DIR = Path(__file__).parent / "cases"

_ROUND = 6  # decimal places for float outputs

# Maps operator -> {data_type -> aggregation_data_type}.
# Absent data_type entries are invalid combinations (API returns 422).
_COMPAT: dict[str, dict[str, str]] = {
    "count": {"float": "int", "int": "int", "bool": "int", "str": "int"},
    "first": {"float": "float", "int": "int", "bool": "bool", "str": "str"},
    "last": {"float": "float", "int": "int", "bool": "bool", "str": "str"},
    "min": {"float": "float", "int": "int", "bool": "bool", "str": "str"},
    "max": {"float": "float", "int": "int", "bool": "bool", "str": "str"},
    "sum": {"float": "float", "int": "int", "bool": "int"},
    "avg": {"float": "float", "int": "float", "bool": "float"},
    "tw_avg": {"float": "float", "int": "float", "bool": "float"},
    "mode": {"float": "float", "int": "int", "bool": "bool", "str": "str"},
    "tw_mode": {"float": "float", "int": "int", "bool": "bool", "str": "str"},
}


def _agg_type(operator: str, data_type: str) -> str:
    return _COMPAT[operator][data_type]


def _valid_ops(data_type: str) -> list[str]:
    return [op for op, types in _COMPAT.items() if data_type in types]


_R_6MO = ("2025-01-01T00:00:00+00:00", "2025-07-01T00:00:00+00:00")
_R_12MO = ("2025-01-01T00:00:00+00:00", "2026-01-01T00:00:00+00:00")
_R_1W = ("2025-01-01T00:00:00+00:00", "2025-01-08T00:00:00+00:00")
_R_DENSE = ("2025-04-01T00:00:00+00:00", "2025-04-04T00:00:00+00:00")
_R_UPSAMP = ("2025-03-01T00:00:00+00:00", "2025-03-04T00:00:00+00:00")
_R_EMPTY = ("2025-01-01T00:00:00+00:00", "2025-01-15T00:00:00+00:00")
_R_CROSS = ("2025-01-01T00:00:00+00:00", "2025-01-08T00:00:00+00:00")
_R_DST_SF = ("2026-03-28T23:00:00+00:00", "2026-03-29T22:00:00+00:00")
_R_DST_FB = ("2026-10-24T22:00:00+00:00", "2026-10-25T23:00:00+00:00")
_R_SINGLE = ("2025-06-14T00:00:00+00:00", "2025-06-17T00:00:00+00:00")

_LOCF_OPS = ["count", "first", "last", "avg", "tw_avg"]


def _cases(
    input_ref: str,
    data_type: str,
    bins: list[str],
    date_range: tuple[str, str],
    timezone: str = "UTC",
    ops: list[str] | None = None,
) -> list[dict[str, str]]:
    start, end = date_range
    return [
        {
            "input_ref": input_ref,
            "agg": op,
            "interval": b,
            "timezone": timezone,
            "start": start,
            "end": end,
        }
        for op in (ops if ops is not None else _valid_ops(data_type))
        for b in bins
    ]


CASE_SPEC: list[dict[str, str]] = [
    *_cases("main_float", "float", ["1d", "1mo"], _R_6MO),
    *_cases("main_int", "int", ["1h"], _R_1W),
    *_cases("main_int", "int", ["1d", "1mo"], _R_6MO),
    *_cases("main_bool", "bool", ["1h"], _R_1W),
    *_cases("main_bool", "bool", ["1d", "1mo"], _R_6MO),
    *_cases("main_str", "str", ["1h"], _R_1W),
    *_cases("main_str", "str", ["1d", "1mo"], _R_12MO),
    *_cases("dense_float", "float", ["15min", "1h", "1d"], _R_DENSE),
    *_cases("upsampling_locf", "float", ["15min"], _R_UPSAMP, ops=_LOCF_OPS),
    *_cases("empty_bucket_locf", "float", ["1d"], _R_EMPTY, ops=_LOCF_OPS),
    *_cases(
        "cross_timezone",
        "float",
        ["1d"],
        _R_CROSS,
        timezone="Europe/Paris",
        ops=["count", "avg"],
    ),
    *_cases(
        "dst_spring_forward",
        "float",
        ["1h", "1d"],
        _R_DST_SF,
        timezone="Europe/Paris",
        ops=["avg", "count", "tw_avg"],
    ),
    *_cases(
        "dst_fall_back",
        "float",
        ["1h", "1d"],
        _R_DST_FB,
        timezone="Europe/Paris",
        ops=["avg", "count", "tw_avg"],
    ),
    *_cases("single_point", "float", ["1d"], _R_SINGLE),
]

Point = tuple[datetime, Any]


def _load_input(name: str) -> dict[str, Any]:
    path = INPUTS_DIR / f"{name}.yaml"
    with path.open() as f:
        return yaml.safe_load(f)


def _parse_points(scenario: dict[str, Any]) -> list[Point]:
    out: list[Point] = []
    for p in scenario["input"]["points"]:
        ts = datetime.fromisoformat(p["timestamp"]).astimezone(UTC)
        out.append((ts, p["value"]))
    return sorted(out, key=lambda x: x[0])


def _tz(name: str) -> Any:
    return UTC if name == "UTC" else ZoneInfo(name)


def _floor_bin(dt: datetime, bin_str: str) -> datetime:
    """Floor dt to the start of its containing bin (preserves timezone)."""
    match bin_str:
        case "15min":
            return dt.replace(minute=(dt.minute // 15) * 15, second=0, microsecond=0)
        case "1h":
            return dt.replace(minute=0, second=0, microsecond=0)
        case "1d":
            return dt.replace(hour=0, minute=0, second=0, microsecond=0)
        case "1mo":
            return dt.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        case _:
            raise ValueError(f"Unknown bin: {bin_str!r}")


def _next_bin(dt: datetime, bin_str: str) -> datetime:
    """Sub-day bins advance in UTC to avoid DST phantom/duplicate bins."""
    match bin_str:
        case "15min":
            return (dt.astimezone(UTC) + timedelta(minutes=15)).astimezone(dt.tzinfo)
        case "1h":
            return (dt.astimezone(UTC) + timedelta(hours=1)).astimezone(dt.tzinfo)
        case "1d":
            # Calendar +1 day: DST transitions give the correct wall-clock midnight.
            d = dt.date() + timedelta(days=1)
            return datetime(d.year, d.month, d.day, tzinfo=dt.tzinfo, fold=0)
        case "1mo":
            year = dt.year + 1 if dt.month == 12 else dt.year
            month = 1 if dt.month == 12 else dt.month + 1
            return dt.replace(year=year, month=month)
        case _:
            raise ValueError(f"Unknown bin: {bin_str!r}")


def _bin_boundaries(
    start_utc: datetime, end_utc: datetime, bin_str: str, tz_name: str
) -> list[tuple[datetime, datetime]]:
    tz = _tz(tz_name)
    current = _floor_bin(start_utc.astimezone(tz), bin_str)

    bins: list[tuple[datetime, datetime]] = []
    while current.astimezone(UTC) < end_utc:
        nxt = _next_bin(current, bin_str)
        bins.append((current.astimezone(UTC), nxt.astimezone(UTC)))
        current = nxt

    return bins


def _locf_before(points: list[Point], ts_utc: datetime) -> Any:
    """Last value strictly before ts_utc, or None."""
    result = None
    for t, v in points:
        if t < ts_utc:
            result = v
        else:
            break
    return result


def _points_in(points: list[Point], start: datetime, end: datetime) -> list[Point]:
    return [(t, v) for t, v in points if start <= t < end]


def _to_num(v: Any, data_type: str) -> float:
    if data_type == "bool":
        return 1.0 if v else 0.0
    return float(v)


def _mode(values: list[Any]) -> Any:
    """Most frequent value; ties broken by smallest."""
    freq: dict[Any, int] = defaultdict(int)
    for v in values:
        freq[v] += 1
    return min(freq, key=lambda k: (-freq[k], k))


def _tw_segs(
    bin_pts: list[Point],
    bin_start: datetime,
    locf: Any,
    data_type: str,
    *,
    numeric: bool,
) -> list[tuple[datetime, Any]] | None:
    """
    Build step-function segments for tw_avg / tw_mode.

    If no LOCF is available, the first in-bin point fills backwards to bin_start.
    Returns None if there is no data at all.
    """
    coerce: Callable[[Any], Any] = (
        (lambda v: _to_num(v, data_type)) if numeric else (lambda v: v)
    )

    if locf is not None:
        segs: list[tuple[datetime, Any]] = [(bin_start, coerce(locf))]
    elif bin_pts:
        segs = [(bin_start, coerce(bin_pts[0][1]))]
    else:
        return None

    for ts, v in bin_pts:
        if ts >= bin_start:
            segs.append((ts, coerce(v)))

    return segs


def _tw_avg(
    bin_pts: list[Point],
    bin_start: datetime,
    bin_end: datetime,
    locf: Any,
    data_type: str,
) -> float | None:
    bin_dur = (bin_end - bin_start).total_seconds()
    segs = _tw_segs(bin_pts, bin_start, locf, data_type, numeric=True)
    if segs is None or bin_dur == 0:
        return None
    total = 0.0
    for i, (seg_ts, val) in enumerate(segs):
        seg_end = segs[i + 1][0] if i + 1 < len(segs) else bin_end
        total += val * (seg_end - seg_ts).total_seconds()
    return round(total / bin_dur, _ROUND)


def _tw_mode(
    bin_pts: list[Point],
    bin_start: datetime,
    bin_end: datetime,
    locf: Any,
    data_type: str,
) -> Any:
    segs = _tw_segs(bin_pts, bin_start, locf, data_type, numeric=False)
    if segs is None:
        return None
    durations: dict[Any, float] = defaultdict(float)
    for i, (seg_ts, val) in enumerate(segs):
        seg_end = segs[i + 1][0] if i + 1 < len(segs) else bin_end
        durations[val] += (seg_end - seg_ts).total_seconds()
    return min(durations, key=lambda k: (-durations[k], k))


# No timestamp context needed — values list is sufficient.
_SIMPLE_OPS: dict[str, Callable[[list[Any]], Any]] = {
    "first": lambda v: v[0],
    "last": lambda v: v[-1],
    "min": min,
    "max": max,
    "sum": sum,
    "avg": lambda v: round(sum(v) / len(v), _ROUND),
    "mode": _mode,
}


def _apply(
    operator: str,
    bin_pts: list[Point],
    bin_start: datetime,
    bin_end: datetime,
    locf: Any,
    data_type: str,
) -> tuple[Any, str]:
    agg_dt = _agg_type(operator, data_type)
    values = [v for _, v in bin_pts]

    if operator == "count":
        return len(values), agg_dt
    if not values:
        # empty bucket: sum of zero observations = 0; all others carry LOCF
        return (0 if operator == "sum" else locf), agg_dt
    if fn := _SIMPLE_OPS.get(operator):
        return fn(values), agg_dt
    if operator == "tw_avg":
        return _tw_avg(bin_pts, bin_start, bin_end, locf, data_type), agg_dt
    if operator == "tw_mode":
        return _tw_mode(bin_pts, bin_start, bin_end, locf, data_type), agg_dt
    raise ValueError(f"Unknown operator: {operator!r}")


def _compute_expected(
    points: list[Point],
    data_type: str,
    start_utc: datetime,
    end_utc: datetime,
    bin_str: str,
    tz_name: str,
    operator: str,
) -> list[dict[str, Any]]:
    bins = _bin_boundaries(start_utc, end_utc, bin_str, tz_name)
    locf: Any = _locf_before(points, bins[0][0]) if bins else None
    result: list[dict[str, Any]] = []

    for bin_start, bin_end in bins:
        bin_pts = _points_in(points, bin_start, bin_end)
        value, agg_dt = _apply(operator, bin_pts, bin_start, bin_end, locf, data_type)
        result.append(
            {
                "interval_start": bin_start.isoformat(),
                "value": value,
                "count": len(bin_pts),
                "aggregation_data_type": agg_dt,
            }
        )
        if bin_pts:
            locf = bin_pts[-1][1]

    return result


def _case_file_name(spec: dict[str, str]) -> str:
    tz_slug = spec["timezone"].replace("/", "_")
    return f"{spec['input_ref']}__{spec['agg']}__{spec['interval']}__{tz_slug}.yaml"


def _write_case(spec: dict[str, str], expected: list[dict[str, Any]]) -> None:
    tz_label = spec["timezone"]
    doc = {
        "name": _case_file_name(spec).removesuffix(".yaml"),
        "input_ref": spec["input_ref"],
        "description": f"{spec['agg']} at {spec['interval']}, {tz_label}",
        "request": {
            "agg": spec["agg"],
            "interval": spec["interval"],
            "start": spec["start"],
            "end": spec["end"],
            "timezone": tz_label,
        },
        "expected": expected,
    }
    with (CASES_DIR / _case_file_name(spec)).open("w") as f:
        yaml.dump(doc, f, default_flow_style=False, allow_unicode=True, sort_keys=False)


def main() -> None:
    if CASES_DIR.exists():
        shutil.rmtree(CASES_DIR)
    CASES_DIR.mkdir(parents=True)

    cache: dict[str, tuple[list[Point], str]] = {}

    print(f"Generating {len(CASE_SPEC)} cases -> {CASES_DIR}")
    for spec in CASE_SPEC:
        ref = spec["input_ref"]
        if ref not in cache:
            scenario = _load_input(ref)
            cache[ref] = (_parse_points(scenario), scenario["input"]["data_type"])

        points, data_type = cache[ref]
        start_utc = datetime.fromisoformat(spec["start"]).astimezone(UTC)
        end_utc = datetime.fromisoformat(spec["end"]).astimezone(UTC)

        expected = _compute_expected(
            points,
            data_type,
            start_utc,
            end_utc,
            spec["interval"],
            spec["timezone"],
            spec["agg"],
        )
        _write_case(spec, expected)
        print(f"  {_case_file_name(spec)} ({len(expected)} bins)")

    print(f"Done. {len(CASE_SPEC)} case files written.")


if __name__ == "__main__":
    main()
