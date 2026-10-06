from __future__ import annotations

from typing import TYPE_CHECKING, Annotated, Any, Literal

from pydantic import Field, field_validator, model_validator

from dashboards.widgets.config import WidgetConfig, validate_space_agg_membership
from models.errors import InvalidError
from models.targets import AttributeTarget  # noqa: TC001
from models.types import AggregationOperator  # noqa: TC001

if TYPE_CHECKING:
    from models.targets import ResolvedTarget

MAX_TARGETS = 20
"""Most targets one chart may plot — bounds what a hand-written payload can ask
the API to resolve at save time."""


class ChartWidgetConfig(WidgetConfig):
    """Time-series chart over one or more attribute targets.

    Each of ``targets`` follows the shared target model: a persisted device set
    (explicit ids or criteria, resolved at render time) paired with a single
    attribute. Every matched device that exposes the attribute becomes a
    series, so several targets plot several attributes of one device, or
    attributes of different devices, on the same chart.

    All series share the chart's ``agg`` and its panel, so the data type must
    be the same across every target's set — enforced at save time by the API
    layer, and surfaced as a render-time error state when a dynamic set drifts
    afterwards.

    Points are read over the dashboard period, so the window itself is never
    stored here — only how wide the buckets cut from it should be.
    """

    type: Literal["chart"] = "chart"
    targets: list[AttributeTarget] = Field(min_length=1, max_length=MAX_TARGETS)
    agg: AggregationOperator | None = None
    """How readings are reduced over each time bucket; ``None`` plots them raw.

    Whether the operator suits the attribute's data type is the timeseries
    package's rule (``AGG_COMPAT``), enforced when the series is read — an
    ``avg`` of a string is refused there rather than here, so this config never
    has to know which combinations exist.
    """

    interval: Annotated[str, Field(pattern=r"^(auto|[1-9]\d*(min|h|d|mo))$")] = "auto"
    """Bucket width the readings are reduced over; ``"auto"`` lets the server
    pick one from the dashboard period. Requires ``agg``.

    Stored, unlike the period itself, because ``"auto"`` targets a bucket
    *count* rather than a bucket *meaning*: over a week it resolves to hourly
    buckets, so a chart of daily consumption cannot be expressed without
    pinning the width. The period stays a viewing concern and is not stored —
    a pinned width simply rides whatever window the dashboard is showing, and
    the chart draws whatever the timeseries endpoint returns for that pair.

    Kept a plain string rather than the timeseries package's ``Interval``: the
    ladder a deployment offers is the aggregate endpoints' own, and naming it
    here would either import sideways from a sibling service or restate a list
    that would then drift. The editor offers what
    ``GET /timeseries/aggregate/options`` reports.

    The pattern constrains the *grammar*, not that ladder, so a width added
    server-side still validates while a typo no longer reaches storage to fail
    at render. It also excludes the two widths that are not chart widths:
    ``raw`` returns the stored points and silently applies no operator at all —
    a chart would still caption itself with the ``agg`` it never ran — and
    ``whole`` reduces the period to the single point a KPI shows. Whether a
    *well-formed* width suits the period stays the read's answer to give.
    """

    mark: Literal["line", "bar"] = "line"
    """How each series is drawn.

    Bars require ``agg``: a bar spans the bucket it reports, and raw readings
    are recorded on change, so an unbucketed series has no width to draw. That
    much is structural and refused here.

    Whether the *data type* suits bars is not: aggregation can change it
    (``count`` yields ints whatever went in), so the plotted type is only known
    once the series is read. The editor offers the choice on numeric
    attributes, and a chart whose set has since drifted to a non-numeric type
    falls back to lines at render — the same render-time treatment drift
    already gets, rather than a save-time gate that would have to re-derive the
    operator's output type here.
    """

    space_agg: AggregationOperator | None = None
    """How each bucket's values are folded across the device set; ``None``
    plots one series per device. Folds one device set, so it requires a single
    target.

    Whether the operator suits the attribute's data type stays the timeseries
    package's rule, like ``agg``. Membership in the space vocabulary, though,
    is shared knowledge (``SPACE_AGGREGATION_OPERATORS``), so an operator that
    can never fold a device set is refused at save time.
    """

    group_by: Annotated[str, Field(min_length=1)] | None = None
    """Tag key to bucket the device set by before folding; ``None`` folds the
    whole set into one series, same as a bare ``space_agg``.

    Requires ``space_agg``: grouping still needs an operator to fold each
    group's devices. Constrained to match the aggregate endpoints'
    ``Query(min_length=1)``, so a saved config never fails to render.
    """

    @field_validator("group_by", mode="before")
    @classmethod
    def _strip_group_by(cls, value: Any) -> Any:  # noqa: ANN401
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="after")
    def _validate_interval(self) -> ChartWidgetConfig:
        if self.interval != "auto" and self.agg is None:
            msg = "interval requires agg: raw readings are not cut into buckets"
            raise ValueError(msg)
        return self

    @model_validator(mode="after")
    def _validate_mark(self) -> ChartWidgetConfig:
        if self.mark == "bar" and self.agg is None:
            msg = "mark 'bar' requires agg: raw readings have no bucket to span"
            raise ValueError(msg)
        return self

    @model_validator(mode="after")
    def _validate_space_agg(self) -> ChartWidgetConfig:
        if self.space_agg is None:
            if self.group_by is not None:
                msg = "group_by requires space_agg: it folds each group's devices"
                raise ValueError(msg)
            return self
        if self.agg is None:
            msg = "space_agg requires agg: raw series cannot be space-aggregated"
            raise ValueError(msg)
        if len(self.targets) > 1:
            msg = "space_agg folds one device set: it requires a single target"
            raise ValueError(msg)
        validate_space_agg_membership(self.space_agg)
        return self

    def attribute_targets(self) -> list[AttributeTarget]:
        return self.targets

    def validate_resolved(self, resolved: list[ResolvedTarget]) -> None:
        """Every target must resolve to the same data type."""
        data_types = sorted({target.data_type.value for target in resolved})
        if len(data_types) > 1:
            msg = (
                f"Mixed data types across the chart's targets: {', '.join(data_types)}"
            )
            raise InvalidError(msg)
