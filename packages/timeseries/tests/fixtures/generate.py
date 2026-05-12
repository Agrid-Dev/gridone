"""Generate raw timeseries fixture YAML files."""

import random
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import polars as pl
import yaml

SEED = 42
OUT_DIR = Path(__file__).parent / "inputs"

_FLOAT_SETPOINTS = [18.0, 18.5, 19.0, 19.5, 20.0, 20.5, 21.0]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _random_ts(start: datetime, end: datetime, n: int, rng: random.Random) -> pl.Series:
    """Sample n randomly-spaced UTC timestamps in [start, end]."""
    span_s = int((end - start).total_seconds())
    offsets = sorted(rng.sample(range(span_s), n))
    epoch_us = int(start.timestamp()) * 1_000_000
    return pl.Series(
        "ts",
        [epoch_us + o * 1_000_000 for o in offsets],
        dtype=pl.Datetime("us", "UTC"),
    )


def _regular_ts(start: datetime, end: datetime, interval: str) -> pl.Series:
    """Return a polars Datetime series at regular intervals."""
    return pl.datetime_range(
        start, end, interval, eager=True, time_unit="us", time_zone="UTC"
    )


def _make_points(timestamps: list[datetime], values: list[Any]) -> list[dict[str, Any]]:
    return [
        {"timestamp": t.isoformat(), "value": v}
        for t, v in zip(timestamps, values, strict=True)
    ]


def _points_from_series(ts: pl.Series, values: list[Any]) -> list[dict[str, Any]]:
    return _make_points(ts.to_list(), values)


def _write(scenario: dict[str, Any]) -> None:
    path = OUT_DIR / f"{scenario['name']}.yaml"
    with path.open("w") as f:
        yaml.dump(
            scenario, f, default_flow_style=False, allow_unicode=True, sort_keys=False
        )
    print(f"  wrote {path.name} ({len(scenario['input']['points'])} points)")


# ---------------------------------------------------------------------------
# Main series (4 data types)
# ---------------------------------------------------------------------------


def scenario_main_float(rng: random.Random) -> dict[str, Any]:
    """6-month float series: random background + fine burst."""
    start = datetime(2025, 1, 1, tzinfo=UTC)
    end = datetime(2025, 7, 1, tzinfo=UTC)

    background = _random_ts(start, end, 120, rng)

    # Fine granularity: every 10 s over a 10-min window (tests sub-minute density)
    burst = _regular_ts(
        datetime(2025, 1, 15, 10, 0, tzinfo=UTC),
        datetime(2025, 1, 15, 10, 10, tzinfo=UTC),
        "10s",
    )

    combined = pl.concat([background, burst]).sort()
    # Quantized to a small set so mode produces a deterministic winner per bucket.
    values = [rng.choice(_FLOAT_SETPOINTS) for _ in range(len(combined))]

    return {
        "name": "main_float",
        "description": (
            "Float series spanning 6 months. 120 random background points plus a "
            "fine burst (every 10 s) on 2025-01-15 10:00-10:10 UTC. "
        ),
        "input": {
            "data_type": "float",
            "points": _points_from_series(combined, values),
        },
    }


def scenario_main_int(rng: random.Random) -> dict[str, Any]:
    """6-month int series, medium-density random spacing."""
    start = datetime(2025, 1, 1, tzinfo=UTC)
    end = datetime(2025, 7, 1, tzinfo=UTC)
    ts = _random_ts(start, end, 200, rng)
    values = [rng.randint(0, 100) for _ in range(len(ts))]

    return {
        "name": "main_int",
        "description": "Int series spanning 6 months with 200 randomly-spaced points.",
        "input": {
            "data_type": "int",
            "points": _points_from_series(ts, values),
        },
    }


def scenario_main_bool(rng: random.Random) -> dict[str, Any]:
    """6-month bool series, medium-density random spacing."""
    start = datetime(2025, 1, 1, tzinfo=UTC)
    end = datetime(2025, 7, 1, tzinfo=UTC)
    ts = _random_ts(start, end, 150, rng)
    values = [rng.choice([True, False]) for _ in range(len(ts))]

    return {
        "name": "main_bool",
        "description": "Bool series spanning 6 months with 150 randomly-spaced points.",
        "input": {
            "data_type": "bool",
            "points": _points_from_series(ts, values),
        },
    }


def scenario_main_str(rng: random.Random) -> dict[str, Any]:
    """12-month str series with YAML-bool-coercible values (on/off/yes/no)."""
    start = datetime(2025, 1, 1, tzinfo=UTC)
    end = datetime(2026, 1, 1, tzinfo=UTC)
    ts = _random_ts(start, end, 60, rng)
    values = [rng.choice(["on", "off", "yes", "no"]) for _ in range(len(ts))]

    return {
        "name": "main_str",
        "description": (
            "Equipment state series using YAML-bool-coercible values (on/off/yes/no) "
            "spanning 12 months with 60 randomly-spaced points. Values must be quoted "
            "in YAML to prevent auto-coercion to bool."
        ),
        "input": {
            "data_type": "str",
            "points": _points_from_series(ts, values),
        },
    }


def scenario_dense_float(rng: random.Random) -> dict[str, Any]:
    """~15 random pts/hour over 3 days — exercises all operators at 1h and 1d."""
    start = datetime(2025, 4, 1, tzinfo=UTC)
    end = datetime(2025, 4, 4, tzinfo=UTC)

    all_ts: list[datetime] = []
    hour = timedelta(hours=1)
    current = start
    while current < end:
        n = rng.randint(12, 18)
        hour_ts = _random_ts(current, current + hour, n, rng)
        all_ts.extend(hour_ts.to_list())
        current += hour

    all_ts.sort()
    values = [rng.choice(_FLOAT_SETPOINTS) for _ in all_ts]

    return {
        "name": "dense_float",
        "description": (
            "Dense float series over 3 days (2025-04-01-04 UTC), ~15 random pts/hour. "
            "Exercises min/max/avg/tw_avg/sum/mode/tw_mode "
            "at 15min, 1h, and 1d with multiple points per bucket."
        ),
        "input": {
            "data_type": "float",
            "points": _make_points(all_ts, values),
        },
    }


# ---------------------------------------------------------------------------
# Edge-case scenarios
# ---------------------------------------------------------------------------


def scenario_upsampling_locf(rng: random.Random) -> dict[str, Any]:
    """1 pt/hour over 3 days — 15min aggregation leaves 3 LOCF bins per hour."""
    ts = _regular_ts(
        datetime(2025, 3, 1, tzinfo=UTC),
        datetime(2025, 3, 4, tzinfo=UTC),
        "1h",
    )
    values = [round(rng.uniform(18.0, 22.0), 2) for _ in range(len(ts))]

    return {
        "name": "upsampling_locf",
        "description": (
            "Float series with one point per hour over 3 days (2025-03-01-04 UTC). "
            "Aggregating at 15 min upsamples: the 3 empty bins per hour carry the "
            "previous hourly value forward (LOCF)."
        ),
        "input": {
            "data_type": "float",
            "points": _points_from_series(ts, values),
        },
    }


def scenario_empty_bucket_locf(rng: random.Random) -> dict[str, Any]:
    """2-week float series with 6 silent days — daily LOCF with count=0."""
    active_days = [1, 2, 3, 10, 11, 12]
    all_ts: list[datetime] = []
    for day in active_days:
        day_start = datetime(2025, 1, day, tzinfo=UTC)
        n = rng.randint(8, 12)
        day_ts = _random_ts(day_start, day_start + timedelta(hours=23), n, rng)
        all_ts.extend(day_ts.to_list())

    all_ts.sort()
    values = [round(rng.uniform(20.0, 24.0), 2) for _ in all_ts]

    return {
        "name": "empty_bucket_locf",
        "description": (
            "Float series over 2 weeks (Jan 1-14 2025). Points only on Jan 1-3 "
            "and Jan 10-12. Days 4-9 and 13-14 have zero raw points — daily "
            "aggregation carries the last known value (LOCF) with count=0."
        ),
        "input": {
            "data_type": "float",
            "points": _make_points(all_ts, values),
        },
    }


def scenario_cross_timezone(rng: random.Random) -> dict[str, Any]:
    """Float series around UTC midnight — Paris daily buckets split differently."""
    base_start = datetime(2025, 1, 1, tzinfo=UTC)
    base_end = datetime(2025, 1, 8, tzinfo=UTC)
    background = _random_ts(base_start, base_end, 60, rng)

    midnight_clusters: list[datetime] = []
    for day_offset in range(7):
        delta = timedelta(days=day_offset)
        window_start = datetime(2025, 1, 1, 22, 30, tzinfo=UTC) + delta
        window_end = datetime(2025, 1, 2, 1, 30, tzinfo=UTC) + delta
        cluster = _random_ts(window_start, window_end, 6, rng)
        midnight_clusters.extend(cluster.to_list())

    clusters_s = pl.Series("ts", midnight_clusters, dtype=pl.Datetime("us", "UTC"))
    combined = pl.concat([background, clusters_s]).sort()
    values = [round(rng.uniform(16.0, 24.0), 2) for _ in range(len(combined))]

    return {
        "name": "cross_timezone",
        "description": (
            "Float series over Jan 1-7 2025 UTC with dense clusters around each UTC "
            "midnight (22:30-01:30 UTC). Daily aggregation in Europe/Paris (UTC+1) "
            "must align bucket boundaries to 23:00 UTC, not 00:00 UTC."
        ),
        "input": {
            "data_type": "float",
            "points": _points_from_series(combined, values),
        },
    }


def scenario_dst_spring_forward(rng: random.Random) -> dict[str, Any]:
    """2026-03-29 Europe/Paris spring-forward: 23-hour day, 02:xx local skipped."""
    # Paris day: 2026-03-28T23:00Z (00:00 CET) to 2026-03-29T22:00Z (next day)
    day_start = [
        datetime(2026, 3, 28, 23, 0, tzinfo=UTC),  # 00:00 CET
        datetime(2026, 3, 28, 23, 30, tzinfo=UTC),  # 00:30 CET
    ]
    before = [  # approaching transition (CET, UTC+1)
        datetime(2026, 3, 29, 0, 0, tzinfo=UTC),  # 01:00 CET
        datetime(2026, 3, 29, 0, 30, tzinfo=UTC),  # 01:30 CET
        datetime(2026, 3, 29, 0, 50, tzinfo=UTC),  # 01:50 CET
        datetime(2026, 3, 29, 0, 58, tzinfo=UTC),  # 01:58 CET (2 min before)
    ]
    after = [  # post-transition (CEST, UTC+2) — 02:xx local does not exist
        datetime(2026, 3, 29, 1, 5, tzinfo=UTC),  # 03:05 CEST
        datetime(2026, 3, 29, 1, 30, tzinfo=UTC),  # 03:30 CEST
        datetime(2026, 3, 29, 2, 0, tzinfo=UTC),  # 04:00 CEST
        datetime(2026, 3, 29, 6, 0, tzinfo=UTC),  # 08:00 CEST
        datetime(2026, 3, 29, 12, 0, tzinfo=UTC),  # 14:00 CEST
        datetime(2026, 3, 29, 18, 0, tzinfo=UTC),  # 20:00 CEST
        datetime(2026, 3, 29, 21, 0, tzinfo=UTC),  # 23:00 CEST (1 h before day end)
    ]
    all_ts = sorted(day_start + before + after)
    values = [round(rng.uniform(18.0, 22.0), 2) for _ in all_ts]

    return {
        "name": "dst_spring_forward",
        "description": (
            "Float series on 2026-03-29 (Europe/Paris spring-forward). "
            "Transition at 01:00 UTC: 01:58 CET -> 03:05 CEST, 02:xx local missing. "
            "Paris day: 2026-03-28T23:00Z to 2026-03-29T22:00Z (23 h)."
        ),
        "input": {
            "data_type": "float",
            "points": _make_points(all_ts, values),
        },
    }


def scenario_dst_fall_back(rng: random.Random) -> dict[str, Any]:
    """2026-10-25 Europe/Paris fall-back: 25-hour day, 02:xx local traversed twice."""
    # Paris day: 2026-10-24T22:00Z (00:00 CEST) to 2026-10-25T23:00Z (next day)
    day_start = [
        datetime(2026, 10, 24, 22, 0, tzinfo=UTC),  # 00:00 CEST
        datetime(2026, 10, 24, 22, 30, tzinfo=UTC),  # 00:30 CEST
        datetime(2026, 10, 24, 23, 0, tzinfo=UTC),  # 01:00 CEST
        datetime(2026, 10, 24, 23, 30, tzinfo=UTC),  # 01:30 CEST
    ]
    first_pass = [  # 02:xx CEST (00:00-01:00 UTC Oct 25)
        datetime(2026, 10, 25, 0, 0, tzinfo=UTC),  # 02:00 CEST
        datetime(2026, 10, 25, 0, 20, tzinfo=UTC),  # 02:20 CEST
        datetime(2026, 10, 25, 0, 45, tzinfo=UTC),  # 02:45 CEST
        datetime(2026, 10, 25, 0, 58, tzinfo=UTC),  # 02:58 CEST (2 min before)
    ]
    second_pass = [  # 02:xx CET (01:00-02:00 UTC Oct 25) — same local, diff offset
        datetime(2026, 10, 25, 1, 5, tzinfo=UTC),  # 02:05 CET
        datetime(2026, 10, 25, 1, 25, tzinfo=UTC),  # 02:25 CET
        datetime(2026, 10, 25, 1, 50, tzinfo=UTC),  # 02:50 CET
        datetime(2026, 10, 25, 1, 59, tzinfo=UTC),  # 02:59 CET (1 min before end)
    ]
    rest = [
        datetime(2026, 10, 25, 2, 0, tzinfo=UTC),  # 03:00 CET
        datetime(2026, 10, 25, 6, 0, tzinfo=UTC),  # 07:00 CET
        datetime(2026, 10, 25, 12, 0, tzinfo=UTC),  # 13:00 CET
        datetime(2026, 10, 25, 18, 0, tzinfo=UTC),  # 19:00 CET
        datetime(2026, 10, 25, 21, 0, tzinfo=UTC),  # 22:00 CET
        datetime(2026, 10, 25, 22, 0, tzinfo=UTC),  # 23:00 CET (1 h before day end)
    ]
    all_ts = sorted(day_start + first_pass + second_pass + rest)
    values = [round(rng.uniform(15.0, 21.0), 2) for _ in all_ts]

    return {
        "name": "dst_fall_back",
        "description": (
            "Float series on 2026-10-25 (Europe/Paris fall-back). "
            "Transition at 01:00 UTC: 02:xx local appears twice "
            "(+02:00 CEST then +01:00 CET). "
            "Paris day: 2026-10-24T22:00Z to 2026-10-25T23:00Z (25 h)."
        ),
        "input": {
            "data_type": "float",
            "points": _make_points(all_ts, values),
        },
    }


def scenario_single_point(rng: random.Random) -> dict[str, Any]:
    """Exactly one data point — exercises LOCF/count edge cases."""
    ts = datetime(2025, 6, 15, 12, 0, tzinfo=UTC)
    value = round(rng.uniform(10.0, 30.0), 3)

    return {
        "name": "single_point",
        "description": (
            "Float series with exactly one data point at 2025-06-15T12:00:00Z. "
            "tw_avg/tw_mode carry value forward; count=1 for containing bucket, "
            "0 elsewhere; first/last/min/max/mode return the value via LOCF."
        ),
        "input": {
            "data_type": "float",
            "points": [{"timestamp": ts.isoformat(), "value": value}],
        },
    }


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main() -> None:
    rng = random.Random(SEED)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    scenarios = [
        scenario_main_float(rng),
        scenario_main_int(rng),
        scenario_main_bool(rng),
        scenario_main_str(rng),
        scenario_dense_float(rng),
        scenario_upsampling_locf(rng),
        scenario_empty_bucket_locf(rng),
        scenario_cross_timezone(rng),
        scenario_dst_spring_forward(rng),
        scenario_dst_fall_back(rng),
        scenario_single_point(rng),
    ]

    print(f"Generating {len(scenarios)} -> {OUT_DIR}")
    for s in scenarios:
        _write(s)
    print("Done.")


if __name__ == "__main__":
    main()
