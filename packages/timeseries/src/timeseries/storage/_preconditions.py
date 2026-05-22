from timeseries.domain.aggregation import AggregationQuery, Interval


def assert_query_resolved(query: AggregationQuery) -> None:
    """Raise RuntimeError if the service forgot to resolve tz or iv before storage."""
    if query.timezone is None:
        msg = "timezone must be resolved by the service before calling storage"
        raise RuntimeError(msg)
    if not isinstance(query.interval, Interval):
        msg = "interval must be resolved by the service before calling storage"
        raise RuntimeError(msg)  # noqa: TRY004
