from collections import defaultdict
from datetime import UTC, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import polars as pl

from timeseries.domain import (
    AggregatedPoint,
    AggregationOperator,
    AggregationQuery,
    AggregationResult,
    DataPoint,
    DataType,
    TimeSeries,
)

_ROUND = 6

_DTYPE_POLARS: dict[DataType, pl.datatypes.DataTypeClass] = {
    DataType.FLOAT: pl.Float64,
    DataType.INT: pl.Int64,
    DataType.BOOL: pl.Boolean,
    DataType.STRING: pl.Utf8,
}


def _tz(name: str) -> Any:
    return UTC if name == "UTC" else ZoneInfo(name)


def _floor_bin(dt: datetime, interval: str) -> datetime:
    """Floor dt to the start of its containing bin, preserving timezone."""
    match interval:
        case "15min":
            return dt.replace(minute=(dt.minute // 15) * 15, second=0, microsecond=0)
        case "1h":
            return dt.replace(minute=0, second=0, microsecond=0)
        case "1d":
            return dt.replace(hour=0, minute=0, second=0, microsecond=0, fold=0)
        case "1mo":
            return dt.replace(day=1, hour=0, minute=0, second=0, microsecond=0, fold=0)
        case _:
            msg = f"Unknown interval: {interval!r}"
            raise ValueError(msg)


def _next_bin(dt: datetime, interval: str) -> datetime:
    """Advance dt by one bin. Sub-day bins advance in UTC to avoid DST phantom bins."""
    match interval:
        case "15min":
            return (dt.astimezone(UTC) + timedelta(minutes=15)).astimezone(dt.tzinfo)
        case "1h":
            return (dt.astimezone(UTC) + timedelta(hours=1)).astimezone(dt.tzinfo)
        case "1d":
            d = dt.date() + timedelta(days=1)
            return datetime(d.year, d.month, d.day, tzinfo=dt.tzinfo, fold=0)
        case "1mo":
            year = dt.year + 1 if dt.month == 12 else dt.year
            month = 1 if dt.month == 12 else dt.month + 1
            return dt.replace(year=year, month=month)
        case _:
            msg = f"Unknown interval: {interval!r}"
            raise ValueError(msg)


def _bin_boundaries(
    start: datetime, end: datetime, interval: str, tz_name: str
) -> list[tuple[datetime, datetime]]:
    """Return list of (bin_start_utc, bin_end_utc) covering [start, end)."""
    tz = _tz(tz_name)
    current = _floor_bin(start.astimezone(tz), interval)
    bins: list[tuple[datetime, datetime]] = []
    while current.astimezone(UTC) < end:
        nxt = _next_bin(current, interval)
        bins.append((current.astimezone(UTC), nxt.astimezone(UTC)))
        current = nxt
    return bins


def _mode(values: list[Any]) -> Any:
    """Most frequent value; ties broken by the smallest value."""
    freq: dict[Any, int] = defaultdict(int)
    for v in values:
        freq[v] += 1
    return min(freq, key=lambda k: (-freq[k], k))


def _tw_segs(
    pts: list[tuple[datetime, Any]],
    bin_start: datetime,
    locf: Any,
    *,
    numeric: bool,
    data_type: DataType,
) -> list[tuple[datetime, Any]] | None:
    """
    Build step-function segments for tw_avg / tw_mode.

    If locf is available it anchors the value from bin_start. Otherwise the first
    in-bin point fills back to bin_start. Returns None when there is no data at all.
    """

    def coerce(v: Any) -> Any:
        if numeric:
            return (1.0 if v else 0.0) if data_type == DataType.BOOL else float(v)
        return v

    if locf is not None:
        segs: list[tuple[datetime, Any]] = [(bin_start, coerce(locf))]
    elif pts:
        segs = [(bin_start, coerce(pts[0][1]))]
    else:
        return None

    for ts, v in pts:
        if ts >= bin_start:
            segs.append((ts, coerce(v)))

    return segs


def _segs_to_step_df(
    segs: list[tuple[datetime, Any]], bin_end: datetime
) -> pl.DataFrame:
    """Build a polars DataFrame of step segments with per-row next-timestamp column.

    Each row gets a next_ts_us column: the timestamp of the following segment, or
    bin_end for the last segment, enabling duration computation via subtraction.
    """
    seg_ts_us = [int(ts.astimezone(UTC).timestamp() * 1_000_000) for ts, _ in segs]
    seg_vals = [v for _, v in segs]
    bin_end_us = int(bin_end.astimezone(UTC).timestamp() * 1_000_000)
    df = pl.DataFrame({"ts_us": seg_ts_us, "val": pl.Series("val", seg_vals)})
    return df.with_columns(
        pl.col("ts_us").shift(-1).fill_null(bin_end_us).alias("next_ts_us")
    )


def _tw_avg_polars(
    pts: list[tuple[datetime, Any]],
    bin_start: datetime,
    bin_end: datetime,
    locf: Any,
    data_type: DataType,
) -> float | None:
    """Compute TWAVG using polars shift-based duration computation.

    Per-row duration = col("ts_us").shift(-1) - col("ts_us"); last row clamped to
    bin_end. Result = (value * duration).sum() / bin_duration.
    """
    segs = _tw_segs(pts, bin_start, locf, numeric=True, data_type=data_type)
    if segs is None:
        return None
    bin_dur = (bin_end - bin_start).total_seconds()
    if bin_dur == 0:
        return None
    df = _segs_to_step_df(segs, bin_end)
    dur_s = (df["next_ts_us"] - df["ts_us"]) / 1_000_000
    total = (df["val"] * dur_s).sum()
    return round(float(total) / bin_dur, _ROUND)


def _tw_mode_polars(
    pts: list[tuple[datetime, Any]],
    bin_start: datetime,
    bin_end: datetime,
    locf: Any,
    data_type: DataType,
) -> Any:
    """Compute TWMODE: value held for the most time; ties broken by smallest."""
    segs = _tw_segs(pts, bin_start, locf, numeric=False, data_type=data_type)
    if segs is None:
        return None
    df = _segs_to_step_df(segs, bin_end)
    dur_s = ((df["next_ts_us"] - df["ts_us"]) / 1_000_000).to_list()
    durations: dict[Any, float] = defaultdict(float)
    for val, dur in zip(df["val"].to_list(), dur_s, strict=True):
        durations[val] += dur
    return min(durations, key=lambda k: (-durations[k], k))


def _empty_value(
    op: AggregationOperator,
    locf: Any,
    data_type: DataType,
) -> Any:
    """Return the value for an empty bucket (no data points in range).

    SUM of zero observations is 0. All other operators carry LOCF forward; AVG and
    TW_AVG coerce LOCF to float because AggregationResult validates float for those ops.
    """
    if op == AggregationOperator.SUM:
        return 0.0 if data_type == DataType.FLOAT else 0
    if locf is None:
        return None
    if op in {AggregationOperator.AVG, AggregationOperator.TW_AVG}:
        return float(locf)
    return locf


def _filled_value(
    op: AggregationOperator,
    vals: pl.Series,
    bucket_pts: list[tuple[datetime, Any]],
    bin_start: datetime,
    bin_end: datetime,
    locf: Any,
    data_type: DataType,
) -> Any:
    match op:
        case AggregationOperator.FIRST:
            return vals[0]
        case AggregationOperator.LAST:
            return vals[-1]
        case AggregationOperator.MIN:
            return vals.min()
        case AggregationOperator.MAX:
            return vals.max()
        case AggregationOperator.SUM:
            if data_type == DataType.BOOL:
                return int(vals.cast(pl.Int64).sum())
            return vals.sum()
        case AggregationOperator.AVG:
            mean = vals.cast(pl.Float64).mean() or 0.0
            return round(mean, _ROUND)  # type: ignore[arg-type]
        case AggregationOperator.MODE:
            return _mode(vals.to_list())
        case AggregationOperator.TW_AVG:
            return _tw_avg_polars(bucket_pts, bin_start, bin_end, locf, data_type)
        case AggregationOperator.TW_MODE:
            return _tw_mode_polars(bucket_pts, bin_start, bin_end, locf, data_type)
        case _:
            msg = f"Unknown operator: {op!r}"
            raise ValueError(msg)


def _apply_op(
    op: AggregationOperator,
    bucket_df: pl.DataFrame,
    bucket_pts: list[tuple[datetime, Any]],
    bin_start: datetime,
    bin_end: datetime,
    locf: Any,
    data_type: DataType,
) -> Any:
    if op == AggregationOperator.COUNT:
        return len(bucket_df)
    if len(bucket_df) == 0:
        return _empty_value(op, locf, data_type)
    return _filled_value(
        op, bucket_df["value"], bucket_pts, bin_start, bin_end, locf, data_type
    )


def compute(
    points: list[DataPoint],
    anchor: DataPoint | None,
    series: TimeSeries,
    query: AggregationQuery,
) -> AggregationResult:
    """Aggregate time-series data using polars for bucketing and per-operator logic.

    Uses tz-aware bucket boundaries (DST-correct for calendar intervals), LOCF for
    empty buckets (except count/sum), polars shift-based duration for tw_avg/tw_mode.
    """
    tz_name = query.timezone or "UTC"

    bins = (
        _bin_boundaries(query.start, query.end, query.interval.value, tz_name)
        if query.start is not None and query.end is not None
        else []
    )

    if not bins:
        return AggregationResult(
            interval=query.interval,
            agg=query.agg,
            data_type=series.data_type,
            timezone=tz_name,
            points=[],
        )

    pl_dtype = _DTYPE_POLARS[series.data_type]

    if points:
        df = pl.DataFrame(
            {
                "ts_us": [
                    int(p.timestamp.astimezone(UTC).timestamp() * 1_000_000)
                    for p in points
                ],
                "value": pl.Series("value", [p.value for p in points], dtype=pl_dtype),
            }
        ).sort("ts_us")
    else:
        df = pl.DataFrame(
            {
                "ts_us": pl.Series([], dtype=pl.Int64),
                "value": pl.Series("value", [], dtype=pl_dtype),
            }
        )

    all_pts: list[tuple[datetime, Any]] = [
        (p.timestamp.astimezone(UTC), p.value) for p in points
    ]

    result_points: list[AggregatedPoint] = []
    locf: Any = anchor.value if anchor is not None else None

    for bin_start, bin_end in bins:
        start_us = int(bin_start.astimezone(UTC).timestamp() * 1_000_000)
        end_us = int(bin_end.astimezone(UTC).timestamp() * 1_000_000)

        bucket_df = df.filter(
            (pl.col("ts_us") >= start_us) & (pl.col("ts_us") < end_us)
        )
        bucket_pts = [(ts, v) for ts, v in all_pts if bin_start <= ts < bin_end]

        value = _apply_op(
            query.agg,
            bucket_df,
            bucket_pts,
            bin_start,
            bin_end,
            locf,
            series.data_type,
        )

        result_points.append(
            AggregatedPoint(interval_start=bin_start, value=value, count=len(bucket_df))
        )

        if len(bucket_df) > 0:
            locf = bucket_df["value"][-1]

    return AggregationResult(
        interval=query.interval,
        agg=query.agg,
        data_type=series.data_type,
        timezone=tz_name,
        points=result_points,
    )
