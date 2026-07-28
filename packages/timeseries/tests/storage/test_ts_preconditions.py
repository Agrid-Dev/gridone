from datetime import UTC, datetime

import pytest

from timeseries.domain.aggregation import (
    AggregationOperator,
    AggregationQuery,
    Interval,
)
from timeseries.storage._preconditions import assert_query_resolved

_START = datetime(2026, 1, 1, tzinfo=UTC)
_END = datetime(2026, 1, 2, tzinfo=UTC)


def _query(interval: Interval | str, timezone: str | None = "UTC") -> AggregationQuery:
    # model_construct skips validation: these are states only a service bug produces.
    return AggregationQuery.model_construct(
        agg=AggregationOperator.AVG,
        interval=interval,
        start=_START,
        end=_END,
        timezone=timezone,
    )


@pytest.mark.parametrize(
    "interval",
    [Interval.model_validate("1h"), "whole"],
    ids=["calendar", "whole"],
)
def test_resolved_query_passes(interval: Interval | str) -> None:
    assert_query_resolved(_query(interval))


def test_unresolved_interval_raises() -> None:
    # "auto" must be resolved by the service; reaching storage with it is a bug.
    with pytest.raises(RuntimeError, match="interval must be resolved"):
        assert_query_resolved(_query("auto"))


def test_unresolved_timezone_raises() -> None:
    with pytest.raises(RuntimeError, match="timezone must be resolved"):
        assert_query_resolved(_query(Interval.model_validate("1h"), timezone=None))
