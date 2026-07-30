"""Space aggregation: fold each time bucket's values across many series.

Time aggregation runs first, per series, with one shared query — the
gap-filled bucket grids are therefore identical — and the space operator
then reduces the N values of every bucket to one. A series with no data in
a bucket (gap-filled ``None``, e.g. a device added mid-window) simply does
not contribute to that bucket.
"""

from collections import Counter
from statistics import fmean
from typing import TYPE_CHECKING, Literal

from pydantic import BaseModel, computed_field, model_validator

from models.errors import InvalidError
from models.types import (
    DATA_TYPE_MAP,
    SPACE_AGGREGATION_OPERATORS,
    AggregationOperator,
    DataType,
)
from timeseries.domain.aggregation import (
    AggregatedPoint,
    AggregationResult,
    Interval,
    resolve_aggregation_data_type,
)

if TYPE_CHECKING:
    from datetime import datetime


def resolve_space_aggregation_data_type(
    space_agg: AggregationOperator, data_type: DataType
) -> DataType:
    """Return the output DataType of a space operator applied to *data_type*.

    *data_type* is the time aggregation's output type — space runs on top of
    it. Raises InvalidError for operators outside the space vocabulary
    (``first``/``delta``/``tw_*`` need an ordering or a duration that a device
    set does not have) and for invalid (operator, type) pairs per AGG_COMPAT.
    """
    if space_agg not in SPACE_AGGREGATION_OPERATORS:
        msg = f"Operator '{space_agg}' is not a space aggregation operator"
        raise InvalidError(msg)
    return resolve_aggregation_data_type(space_agg, data_type)


class SpaceAggregationResult(BaseModel):
    interval: Interval | Literal["whole"]
    agg: AggregationOperator
    space_agg: AggregationOperator
    data_type: DataType
    timezone: str
    series_count: int
    points: list[AggregatedPoint]
    """Per bucket, ``value`` folds the contributing series and ``count`` is
    how many contributed — not a sample count as in per-series results."""

    @computed_field
    @property
    def aggregation_data_type(self) -> DataType:
        return resolve_space_aggregation_data_type(
            self.space_agg,
            resolve_aggregation_data_type(self.agg, self.data_type),
        )

    @model_validator(mode="after")
    def _validate_point_value_types(self) -> "SpaceAggregationResult":
        expected_type = DATA_TYPE_MAP[self.aggregation_data_type]
        for point in self.points:
            if point.value is not None and not isinstance(point.value, expected_type):
                msg = (
                    f"Point value {point.value!r} does not match "
                    f"aggregation_data_type {self.aggregation_data_type!r}"
                )
                raise ValueError(msg)
        return self


_SpaceValue = bool | int | float | str


def _fold(
    values: list[_SpaceValue],
    space_agg: AggregationOperator,
    output_type: DataType,
) -> _SpaceValue:
    """Reduce one bucket's per-series values with the space operator.

    ``mode`` breaks ties on the smallest value, matching the deterministic
    ``ORDER BY cnt DESC, value ASC`` convention of the time-side SQL.
    """
    match space_agg:
        case AggregationOperator.COUNT:
            return len(values)
        case AggregationOperator.AVG:
            return fmean(float(v) for v in values)
        case AggregationOperator.SUM:
            total = sum(values)
            return float(total) if output_type == DataType.FLOAT else int(total)
        case AggregationOperator.MIN:
            return min(values)
        case AggregationOperator.MAX:
            return max(values)
        case AggregationOperator.MODE:
            counts = Counter(values)
            best = max(counts.values())
            return min(v for v, c in counts.items() if c == best)
        case _:  # pragma: no cover - guarded by resolve_space_aggregation_data_type
            msg = f"Operator '{space_agg}' is not a space aggregation operator"
            raise InvalidError(msg)


def combine_space(
    results: list[AggregationResult], space_agg: AggregationOperator
) -> list[AggregatedPoint]:
    """Fold per-series aggregation results into one space-aggregated series.

    Buckets are merged by ``interval_start`` (the union, in order) so a grid
    drift between backends degrades to partial buckets instead of an error.
    Each output point's ``count`` is the number of series that contributed a
    value to that bucket; a bucket no series covered keeps ``value=None``.
    """
    output_type = resolve_space_aggregation_data_type(
        space_agg,
        resolve_aggregation_data_type(results[0].agg, results[0].data_type),
    )
    buckets: dict[datetime, list[_SpaceValue]] = {}
    for result in results:
        for point in result.points:
            values = buckets.setdefault(point.interval_start, [])
            if point.value is not None:
                values.append(point.value)
    return [
        AggregatedPoint(
            interval_start=start,
            value=_fold(values, space_agg, output_type) if values else None,
            count=len(values),
        )
        for start, values in sorted(buckets.items())
    ]
