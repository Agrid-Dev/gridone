# gridone-timeseries

Domain package for recording and querying device measurements.

## Responsibilities

- Series and data point models (`TimeSeries`, `DataPoint`, `SeriesKey`)
- Bucketed aggregation over a time range (`AggregationQuery` → `AggregationResult`)
- Storage abstraction (`TimeSeriesStorage`) with in-memory and TimescaleDB backends
- CSV and PNG exporters

## Aggregation operators

`AGG_COMPAT` in `domain/aggregation.py` is the single source of truth: it maps
each `(operator, input data type)` pair to the output data type, and drives both
the 422 for invalid combinations and the `operators_by_data_type` payload of
`GET /devices/timeseries/aggregate/options`.

| Operator  | float | int   | bool  | str | Notes                                        |
| --------- | ----- | ----- | ----- | --- | -------------------------------------------- |
| `count`   | int   | int   | int   | int | Number of raw points in the bucket           |
| `first`   | float | int   | bool  | str |                                              |
| `last`    | float | int   | bool  | str |                                              |
| `min`     | float | int   | bool  | str |                                              |
| `max`     | float | int   | bool  | str |                                              |
| `sum`     | float | int   | int   | —   | Empty bucket is 0                            |
| `delta`   | float | int   | —     | —   | Counter consumption, see below               |
| `avg`     | float | float | float | —   | Sample mean of the points                    |
| `tw_avg`  | float | float | float | —   | Time-weighted mean of the step function      |
| `mode`    | float | int   | bool  | str | Most frequent value, ties broken by smallest |
| `tw_mode` | float | int   | bool  | str | Longest-held value                           |

Except for `count`, `sum` and `delta`, an empty bucket carries the previous value
forward (LOCF), seeded from the last point before the requested range.

### `delta`

Consumption of a cumulative counter (energy or water index) over each bucket.
A bucket's value is `last(bucket) - prev`, where `prev` is the last value seen
strictly before the bucket — carried across empty buckets and seeded from the
point preceding the range.

Carrying rather than differencing inside the bucket makes buckets tile: the
deltas sum to the counter's increase over the whole range, so nothing is lost
between a bucket's last point and the next bucket's first one. It also keeps a
meter that reports once per bucket meaningful, where an in-bucket `last - first`
would report 0 everywhere.

| Bucket state                     | Value          |
| -------------------------------- | -------------- |
| No points                        | `null`         |
| Points, previous value known     | `last - prev`  |
| Points, no previous value at all | `last - first` |

- An empty bucket has **no value**, never 0 — nothing was read, and the
  consumption since the last reading lands on the next bucket that has one.
- Counter resets (meter replacement, rollover) are **passed through** as negative
  deltas rather than clamped or split. The caller decides what to do with them.

Like every operator, `delta` is ignored when `interval=raw` is requested
explicitly — see the note below.

## Space aggregation

`get_aggregate_many(keys, query, space_agg)` folds one attribute over a set of
series into a single series, in two stages:

1. **Time** — every series runs the same resolved `AggregationQuery`, in the
   storage backend. The gap-filled bucket grids are anchored on the query's
   `start`/`end`, so they are identical across series.
2. **Space** — `combine_space` (`domain/space.py`) reduces each bucket's values
   across the set with `space_agg`.

The space vocabulary is `models.types.SPACE_AGGREGATION_OPERATORS`: `avg`,
`sum`, `min`, `max`, `count`, `mode`. The other operators need an ordering
(`first`/`last`/`delta`) or time spent per value (`tw_*`), neither of which
exists across devices, and are refused. The set lives in `models` so a config
(e.g. a dashboard widget) can validate membership at save time without
importing this package; what a pair of operators yields remains `AGG_COMPAT`,
applied twice: `space_agg` runs on the *output* type of `agg` — `last` on a
bool set then `sum` counts how many are ON (int), `avg` gives the fraction
(float), `mode` on a str `mode` chain names the predominant state.

Per output bucket, `value` is the fold and `count` is how many series
contributed — not a sample count. A series with no data in a bucket (e.g. a
device added mid-window: gap-filled `None`, no LOCF anchor) simply does not
contribute there, which is how sets with different history bounds stay
aggregable. LOCF still applies within each series' own history, so a device
that last reported an hour ago still holds its value in the fold. `mode`
breaks ties on the smallest value, matching the time-side SQL convention.
`interval=raw` is refused: without shared buckets there is nothing to fold.

Keys without a recorded series are skipped (reported via `series_count`);
mixed data types across the found series raise `InvalidError`.

## `interval=raw`

`raw` returns the stored points untouched, so the operator plays no part in the
result. `interval=auto` therefore never resolves to `raw`: when no canonical
bucket width yields a usable bucket count, it falls back to `whole`, which still
applies the operator over a single bucket.

Requesting `raw` explicitly remains possible — it is advertised by
`GET /devices/timeseries/aggregate/options` — but it makes `agg` a no-op for
every operator, which is arguably a modelling problem in its own right rather
than a per-operator concern.

## Design notes

- The service resolves timezone and `interval="auto"` before calling storage;
  backends assert on an unresolved query (`storage/_preconditions.py`).
- Both backends are held to the same golden fixtures (`tests/fixtures/`),
  generated by an independent reference implementation in
  `tests/fixtures/compute.py` and replayed against memory and TimescaleDB by
  `tests/service/test_aggregation.py`.
- No FastAPI dependency exists in this package; HTTP wiring belongs to `gridone-api`.
