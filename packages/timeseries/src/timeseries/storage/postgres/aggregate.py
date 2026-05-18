from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from timeseries.domain import (
    AggregatedPoint,
    AggregationOperator,
    AggregationResult,
    DataType,
    Interval,
)

_SQL_INTERVALS: dict[Interval, str] = {
    Interval.MIN_15: "15 minutes",
    Interval.H_1: "1 hour",
    Interval.D_1: "1 day",
    Interval.MO_1: "1 month",
}

_GAPFILL_BUCKET_EXPR = (
    "time_bucket_gapfill($1::text::interval, bucket,"
    " start => $2::timestamptz,"
    " finish => $3::timestamptz,"
    " timezone => $4)"
)

_GAPFILL_GROUP_BY = (
    "    GROUP BY time_bucket_gapfill(\n"
    "        $1::text::interval, bucket,\n"
    "        start => $2::timestamptz,\n"
    "        finish => $3::timestamptz,\n"
    "        timezone => $4\n"
    "    )\n"
)

if TYPE_CHECKING:
    from datetime import datetime

    import asyncpg

    from timeseries.domain import AggregationQuery, DataPoint, TimeSeries

    _AnchorValue = float | bool | int | str | None
    _Params = list[_AnchorValue | str | datetime]


@dataclass(frozen=True)
class _QueryCtx:
    value_col: str
    anchor_value: _AnchorValue
    tz: str
    interval_str: str
    series_id: str
    start: datetime
    end: datetime
    data_type: DataType


def _base_params(ctx: _QueryCtx) -> _Params:
    return [ctx.interval_str, ctx.start, ctx.end, ctx.tz, ctx.series_id]


def _anchor_params(ctx: _QueryCtx) -> _Params:
    return [
        ctx.interval_str,
        ctx.start,
        ctx.end,
        ctx.tz,
        ctx.series_id,
        ctx.anchor_value,
    ]


def _end_boundary(ctx: _QueryCtx) -> str:
    """Return a SQL expression for the exclusive upper bound of the last bucket.

    For sub-day intervals the boundary is straightforward: start of the bucket
    containing ($end - 1µs) plus one interval. For day/month intervals we add 2
    hours before the outer bucket call to land safely inside the target bucket
    regardless of DST transitions (a DST spring-forward can push
    bucket_start + 1 day across midnight into the wrong bucket).
    """
    if ctx.interval_str in {"1 day", "1 month"}:
        return (
            "time_bucket($1::text::interval,"
            " time_bucket($1::text::interval,"
            " $3::timestamptz - '1 microsecond'::interval, $4)"
            " + $1::text::interval + interval '2 hours', $4)"
        )
    return (
        "time_bucket($1::text::interval,"
        " $3::timestamptz - '1 microsecond'::interval, $4)"
        " + $1::text::interval"
    )


def _bucket_end(ctx: _QueryCtx) -> str:
    """Return a SQL expression for the end timestamp of a given bucket.

    Same DST +2 hours trick as _end_boundary: for day/month buckets, adding the
    raw interval can land on an ambiguous wall-clock time during a DST transition,
    so we nudge by 2 hours before re-bucketing to resolve to the correct boundary.
    """
    if ctx.interval_str in {"1 day", "1 month"}:
        return (
            "time_bucket($1::text::interval,"
            " bucket + $1::text::interval + interval '2 hours', $4)"
        )
    return "bucket + $1::text::interval"


def _mode_outer_exprs(data_type: DataType) -> tuple[str, str]:
    if data_type == DataType.BOOL:
        return "bool_or(value)", "bool_or(last_raw)"
    return "MAX(value)", "MAX(last_raw)"


def _locf_parts(
    op: AggregationOperator, data_type: DataType, vc: str
) -> tuple[str, str, str]:
    match op:
        case AggregationOperator.AVG:
            if data_type == DataType.BOOL:
                return (
                    f"AVG({vc}::int)",
                    f"last({vc}::int::double precision, timestamp)",
                    "$6::double precision",
                )
            return (
                f"AVG({vc}::double precision)",
                f"last({vc}::double precision, timestamp)",
                "$6::double precision",
            )
        case AggregationOperator.MIN:
            agg = f"bool_and({vc})" if data_type == DataType.BOOL else f"MIN({vc})"
            return agg, f"last({vc}, timestamp)", "$6"
        case AggregationOperator.MAX:
            agg = f"bool_or({vc})" if data_type == DataType.BOOL else f"MAX({vc})"
            return agg, f"last({vc}, timestamp)", "$6"
        case AggregationOperator.FIRST:
            return f"first({vc}, timestamp)", f"last({vc}, timestamp)", "$6"
        case AggregationOperator.LAST:
            return f"last({vc}, timestamp)", f"last({vc}, timestamp)", "$6"
        case _:
            msg = f"_locf_parts does not handle operator {op!r}"
            raise ValueError(msg)


def _simple_query(
    op: AggregationOperator,
    data_type: DataType,
    ctx: _QueryCtx,
) -> tuple[str, _Params]:
    gapfill = (
        "time_bucket_gapfill($1::text::interval, timestamp,"
        " start => $2::timestamptz,"
        " finish => $3::timestamptz,"
        " timezone => $4)"
    )
    count_expr = "COALESCE(COUNT(timestamp), 0)::int"
    vc = ctx.value_col
    val_expr: str
    params: _Params

    match op:
        case AggregationOperator.COUNT:
            val_expr = "COALESCE(COUNT(timestamp), 0)::bigint"
            params = _base_params(ctx)

        case AggregationOperator.SUM:
            if data_type == DataType.BOOL:
                val_expr = f"COALESCE(SUM({vc}::int), 0)::bigint"
            elif data_type == DataType.INT:
                val_expr = f"COALESCE(SUM({vc}), 0)::bigint"
            else:
                val_expr = f"COALESCE(SUM({vc}), 0)::double precision"
            params = _base_params(ctx)

        case _:
            agg_expr, locf_cast, prev_cast = _locf_parts(op, data_type, vc)
            params = _anchor_params(ctx)

    where = (
        "WHERE series_id = $5\n"
        "  AND timestamp >= $2::timestamptz\n"
        f"  AND timestamp < {_end_boundary(ctx)}"
    )

    if op in {
        AggregationOperator.COUNT,
        AggregationOperator.SUM,
    }:
        sql = (
            "SELECT\n"
            f"    {gapfill} AS bucket,\n"
            f"    {val_expr} AS value,\n"
            f"    {count_expr} AS count\n"
            "FROM ts_data_points\n"
            f"{where}\n"
            "GROUP BY bucket\n"
            "ORDER BY bucket"
        )
    else:
        sql = (
            "SELECT bucket, COALESCE(agg_val, locf_val) AS value, cnt AS count\n"
            "FROM (\n"
            "    SELECT\n"
            f"        {gapfill} AS bucket,\n"
            f"        {agg_expr} AS agg_val,\n"
            f"        locf({locf_cast},"
            f" prev => {prev_cast},"
            " treat_null_as_missing => true) AS locf_val,\n"
            f"        {count_expr} AS cnt\n"
            "    FROM ts_data_points\n"
            f"    {where}\n"
            "    GROUP BY bucket\n"
            ") _\n"
            "ORDER BY bucket"
        )
    return sql, params


def _mode_query(ctx: _QueryCtx) -> tuple[str, _Params]:
    vc = ctx.value_col
    outer_agg, outer_last = _mode_outer_exprs(ctx.data_type)
    where_end = f"timestamp < {_end_boundary(ctx)}"
    sql = (
        "WITH val_counts AS (\n"
        "    SELECT\n"
        f"        time_bucket($1::text::interval, timestamp, $4) AS bucket,\n"
        f"        {vc} AS value,\n"
        "        COUNT(*) AS cnt\n"
        "    FROM ts_data_points\n"
        "    WHERE series_id = $5\n"
        "      AND timestamp >= $2::timestamptz\n"
        f"      AND {where_end}\n"
        f"    GROUP BY bucket, {vc}\n"
        "),\n"
        "bucket_totals AS (\n"
        "    SELECT bucket, SUM(cnt)::int AS total_count\n"
        "    FROM val_counts\n"
        "    GROUP BY bucket\n"
        "),\n"
        "raw_last AS (\n"
        "    SELECT\n"
        f"        time_bucket($1::text::interval, timestamp, $4) AS bucket,\n"
        f"        last({vc}, timestamp) AS last_raw\n"
        "    FROM ts_data_points\n"
        "    WHERE series_id = $5\n"
        "      AND timestamp >= $2::timestamptz\n"
        f"      AND {where_end}\n"
        "    GROUP BY bucket\n"
        "),\n"
        "winners AS (\n"
        "    SELECT DISTINCT ON (vc.bucket)\n"
        "        vc.bucket, vc.value, bt.total_count, rl.last_raw\n"
        "    FROM val_counts vc\n"
        "    JOIN bucket_totals bt ON vc.bucket = bt.bucket\n"
        "    JOIN raw_last rl ON vc.bucket = rl.bucket\n"
        "    ORDER BY vc.bucket, vc.cnt DESC, vc.value ASC\n"
        ")\n"
        "SELECT bucket, COALESCE(mode_val, locf_val) AS value, cnt AS count\n"
        "FROM (\n"
        "    SELECT\n"
        f"        {_GAPFILL_BUCKET_EXPR} AS bucket,\n"
        f"        {outer_agg} AS mode_val,\n"
        f"        locf({outer_last}, prev => $6,"
        " treat_null_as_missing => true) AS locf_val,\n"
        "        COALESCE(MAX(total_count), 0)::int AS cnt\n"
        "    FROM winners\n"
        f"{_GAPFILL_GROUP_BY}"
        ") _\n"
        "ORDER BY bucket"
    )
    return sql, _anchor_params(ctx)


def _twavg_query(ctx: _QueryCtx) -> tuple[str, _Params]:
    raw_val = (
        f"{ctx.value_col}::int::double precision"
        if ctx.data_type == DataType.BOOL
        else f"{ctx.value_col}::double precision"
    )
    bucket_end = _bucket_end(ctx)
    sql = (
        "WITH src AS (\n"
        "    SELECT\n"
        f"        timestamp, {raw_val} AS v,\n"
        "        time_bucket($1::text::interval, timestamp, $4) AS bucket\n"
        "    FROM ts_data_points\n"
        "    WHERE series_id = $5\n"
        "      AND timestamp >= $2::timestamptz\n"
        "      AND timestamp < $3::timestamptz\n"
        "),\n"
        "weighted AS (\n"
        "    SELECT bucket, v, timestamp,\n"
        "        CASE WHEN LAG(bucket) OVER w IS DISTINCT FROM bucket THEN\n"
        "            COALESCE(LAG(v) OVER w, $6::double precision, v)\n"
        "            * EXTRACT(EPOCH FROM (timestamp - bucket))\n"
        "        ELSE 0 END AS locf_wt,\n"
        "        v * EXTRACT(EPOCH FROM (\n"
        "            LEAST(\n"
        "                COALESCE(LEAD(timestamp) OVER w, $3::timestamptz),\n"
        f"                {bucket_end}\n"
        "            ) - timestamp\n"
        "        )) AS hold_wt\n"
        "    FROM src\n"
        "    WINDOW w AS (ORDER BY timestamp)\n"
        ")\n"
        "SELECT bucket, COALESCE(tw_val, locf_val) AS value, cnt AS count\n"
        "FROM (\n"
        "    SELECT\n"
        f"        {_GAPFILL_BUCKET_EXPR} AS bucket,\n"
        "        SUM(locf_wt + hold_wt) / NULLIF(\n"
        f"            EXTRACT(EPOCH FROM MAX(({bucket_end}) - bucket)), 0\n"
        "        ) AS tw_val,\n"
        "        locf(last(v, timestamp), prev => $6::double precision,"
        " treat_null_as_missing => true) AS locf_val,\n"
        "        COALESCE(COUNT(timestamp), 0)::int AS cnt\n"
        "    FROM weighted\n"
        f"{_GAPFILL_GROUP_BY}"
        ") _\n"
        "ORDER BY bucket"
    )
    return sql, _anchor_params(ctx)


def _twmode_query(ctx: _QueryCtx) -> tuple[str, _Params]:
    vc = ctx.value_col
    outer_agg, outer_last = _mode_outer_exprs(ctx.data_type)
    sql = (
        "WITH src AS (\n"
        "    SELECT\n"
        f"        timestamp, {vc} AS v,\n"
        "        time_bucket($1::text::interval, timestamp, $4) AS bucket\n"
        "    FROM ts_data_points\n"
        "    WHERE series_id = $5\n"
        "      AND timestamp >= $2::timestamptz\n"
        "      AND timestamp < $3::timestamptz\n"
        "),\n"
        "src_aug AS (\n"
        "    SELECT timestamp, v, bucket,\n"
        "        LAG(v) OVER (ORDER BY timestamp) AS lag_v,\n"
        "        LAG(bucket) OVER (ORDER BY timestamp) AS lag_bucket,\n"
        "        LEAD(timestamp) OVER (ORDER BY timestamp) AS lead_ts\n"
        "    FROM src\n"
        "),\n"
        "segs AS (\n"
        "    SELECT bucket, v,\n"
        "        EXTRACT(EPOCH FROM (\n"
        f"            LEAST(COALESCE(lead_ts, $3::timestamptz), {_bucket_end(ctx)})\n"
        "            - timestamp\n"
        "        )) AS dur\n"
        "    FROM src_aug\n"
        "    UNION ALL\n"
        "    SELECT bucket, COALESCE(lag_v, $6, v) AS v,\n"
        "        EXTRACT(EPOCH FROM (timestamp - bucket)) AS dur\n"
        "    FROM src_aug\n"
        "    WHERE lag_bucket IS DISTINCT FROM bucket AND timestamp > bucket\n"
        "),\n"
        "val_durs AS (\n"
        "    SELECT bucket, v, SUM(dur) AS total_dur\n"
        "    FROM segs\n"
        "    GROUP BY bucket, v\n"
        "),\n"
        "raw_counts AS (\n"
        f"    SELECT bucket, COUNT(*)::int AS cnt, last(v, timestamp) AS last_raw\n"
        "    FROM src\n"
        "    GROUP BY bucket\n"
        "),\n"
        "winners AS (\n"
        "    SELECT DISTINCT ON (vd.bucket)\n"
        "        vd.bucket, vd.v AS value, rc.cnt, rc.last_raw\n"
        "    FROM val_durs vd\n"
        "    JOIN raw_counts rc ON vd.bucket = rc.bucket\n"
        "    ORDER BY vd.bucket, vd.total_dur DESC, vd.v ASC\n"
        ")\n"
        "SELECT bucket, COALESCE(tw_mode_val, locf_val) AS value, cnt AS count\n"
        "FROM (\n"
        "    SELECT\n"
        f"        {_GAPFILL_BUCKET_EXPR} AS bucket,\n"
        f"        {outer_agg} AS tw_mode_val,\n"
        f"        locf({outer_last}, prev => $6,"
        " treat_null_as_missing => true) AS locf_val,\n"
        "        COALESCE(MAX(cnt), 0)::int AS cnt\n"
        "    FROM winners\n"
        f"{_GAPFILL_GROUP_BY}"
        ") _\n"
        "ORDER BY bucket"
    )
    return sql, _anchor_params(ctx)


def _coerce_anchor(op: AggregationOperator, anchor: DataPoint | None) -> _AnchorValue:
    if anchor is None:
        return None
    # AVG / TW_AVG output float; coerce so asyncpg sends double precision for $6 cast.
    v = anchor.value
    if op in {AggregationOperator.AVG, AggregationOperator.TW_AVG}:
        return float(v)
    return v


async def compute(
    pool: asyncpg.Pool,
    series: TimeSeries,
    query: AggregationQuery,
    anchor: DataPoint | None,
    value_col: str,
) -> AggregationResult:
    assert query.start is not None  # noqa: S101
    assert query.end is not None  # noqa: S101
    op = query.agg
    data_type = series.data_type
    ctx = _QueryCtx(
        value_col=value_col,
        anchor_value=_coerce_anchor(op, anchor),
        tz=query.timezone or "UTC",
        interval_str=_SQL_INTERVALS[query.interval],
        series_id=series.id,
        start=query.start,
        end=query.end,
        data_type=data_type,
    )

    match op:
        case AggregationOperator.MODE:
            sql, params = _mode_query(ctx)
        case AggregationOperator.TW_AVG:
            sql, params = _twavg_query(ctx)
        case AggregationOperator.TW_MODE:
            sql, params = _twmode_query(ctx)
        case _:
            sql, params = _simple_query(op, data_type, ctx)

    rows = await pool.fetch(sql, *params)

    points = [
        AggregatedPoint(
            interval_start=row["bucket"],
            value=row["value"],
            count=row["count"],
        )
        for row in rows
    ]

    return AggregationResult(
        interval=query.interval,
        agg=op,
        data_type=data_type,
        timezone=ctx.tz,
        points=points,
    )
