from enum import StrEnum

AttributeValueType = int | float | str | bool


class DataType(StrEnum):
    INT = "int"
    FLOAT = "float"
    STRING = "str"
    BOOL = "bool"


class AggregationOperator(StrEnum):
    """How a set of readings is reduced to one value over a time bucket.

    Shared vocabulary: ``timeseries`` owns the semantics — which operators a
    data type admits, and what type each yields (``AGG_COMPAT``) — while other
    packages need only to name one. A dashboard widget storing ``"avg"`` in its
    config must not import the timeseries package to spell it.

    What each operator means, and the corner cases of ``delta`` in particular,
    are documented in ``packages/timeseries/README.md``.
    """

    AVG = "avg"
    TW_AVG = "tw_avg"
    SUM = "sum"
    MIN = "min"
    MAX = "max"
    FIRST = "first"
    LAST = "last"
    MODE = "mode"
    TW_MODE = "tw_mode"
    COUNT = "count"
    DELTA = "delta"


SPACE_AGGREGATION_OPERATORS: frozenset[AggregationOperator] = frozenset(
    {
        AggregationOperator.AVG,
        AggregationOperator.SUM,
        AggregationOperator.MIN,
        AggregationOperator.MAX,
        AggregationOperator.COUNT,
        AggregationOperator.MODE,
    }
)
"""Operators that can fold one bucket's values across a device set.

Space has no ordering and no duration: ``first``/``last``/``delta`` need a
sequence and the ``tw_*`` operators need time spent per value, so none of
them mean anything across devices. Shared here so a widget config can refuse
a non-space operator at save time without importing the timeseries package.
"""


class SortOrder(StrEnum):
    ASC = "asc"
    DESC = "desc"


DATA_TYPE_MAP: dict[DataType, type] = {
    DataType.INT: int,
    DataType.FLOAT: float,
    DataType.STRING: str,
    DataType.BOOL: bool,
}

VALUE_TYPE_MAP: dict[type, DataType] = {v: k for k, v in DATA_TYPE_MAP.items()}


class Severity(StrEnum):
    INFO = "info"
    WARNING = "warning"
    ALERT = "alert"
