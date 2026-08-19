from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from pydantic import BaseModel, ValidationError

from api.dependencies import (
    get_device_manager,
    get_target_resolver,
    get_ts_service,
    require_permission,
)
from api.devices_filter import parse_tags_params
from api.permissions import Permission
from api.schemas.timeseries import (
    AggregatedPointResponse,
    AggregateOptionsResponse,
    AggregationResultResponse,
    DataPointResponse,
    FetchPointsResultResponse,
    GroupedLiveAggregateResponse,
    IntervalOption,
    LiveAggregateGroupResponse,
    LiveSpaceAggregateResponse,
    TimeSeriesResponse,
)
from api.targets import CompositeTargetResolver, group_device_ids_by_tag
from devices_manager import DevicesServiceInterface
from models.errors import InvalidError, NotFoundError
from models.targets import AttributeTarget, DevicesFilter
from timeseries.domain import (
    AggregationOperator,
    AggregationQuery,
    GroupedSpaceAggregationResult,
    SeriesKey,
    SpaceAggregationResult,
    validate_space_operator,
)
from timeseries.service import TimeSeriesService

router = APIRouter()


class ExportQueryParams(BaseModel):
    series_ids: list[str]
    start: datetime | None = None
    end: datetime | None = None
    last: str | None = None
    carry_forward: bool = True
    title: str | None = None


def get_export_query_params(
    series_ids: list[str] = Query(...),
    start: datetime | None = Query(None),
    end: datetime | None = Query(None),
    last: str | None = Query(None),
    *,
    carry_forward: bool = Query(default=True),
    title: str | None = Query(None),
) -> ExportQueryParams:
    return ExportQueryParams(
        series_ids=series_ids,
        start=start,
        end=end,
        last=last,
        carry_forward=carry_forward,
        title=title,
    )


@router.get(
    "/timeseries/export/csv",
    dependencies=[Depends(require_permission(Permission.TIMESERIES_READ))],
)
async def export_timeseries_csv(
    params: ExportQueryParams = Depends(get_export_query_params),
    ts: TimeSeriesService = Depends(get_ts_service),
) -> Response:
    csv_content = await ts.export_csv(
        params.series_ids,
        start=params.start,
        end=params.end,
        last=params.last,
        carry_forward=params.carry_forward,
    )
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="export.csv"'},
    )


@router.get(
    "/timeseries/export/png",
    dependencies=[Depends(require_permission(Permission.TIMESERIES_READ))],
)
async def export_timeseries_png(
    params: ExportQueryParams = Depends(get_export_query_params),
    ts: TimeSeriesService = Depends(get_ts_service),
) -> Response:
    png_content = await ts.export_png(**params.model_dump())
    return Response(
        content=png_content,
        media_type="image/png",
        headers={"Content-Disposition": 'attachment; filename="export.png"'},
    )


@router.get(
    "/{device_id}/timeseries",
    dependencies=[Depends(require_permission(Permission.TIMESERIES_READ))],
)
async def list_device_timeseries(
    device_id: str,
    metric: str | None = Query(None),
    dm: DevicesServiceInterface = Depends(get_device_manager),
    ts: TimeSeriesService = Depends(get_ts_service),
) -> list[TimeSeriesResponse]:
    dm.get_device(device_id)
    results = await ts.list_series(owner_id=device_id, metric=metric)
    return [TimeSeriesResponse(**s.__dict__) for s in results]


@router.get(
    "/{device_id}/timeseries/{attr}",
    dependencies=[Depends(require_permission(Permission.TIMESERIES_READ))],
)
async def get_device_timeseries_points(
    device_id: str,
    attr: str,
    start: datetime | None = Query(None),
    end: datetime | None = Query(None),
    last: str | None = Query(None),
    *,
    carry_forward: bool = Query(default=False),
    timezone: str | None = Query(None),
    limit: int | None = Query(None),
    dm: DevicesServiceInterface = Depends(get_device_manager),
    ts: TimeSeriesService = Depends(get_ts_service),
) -> FetchPointsResultResponse:
    dm.get_device(device_id)
    series = await ts.get_series_by_key(SeriesKey(owner_id=device_id, metric=attr))
    if series is None:
        msg = f"No timeseries found for device '{device_id}', attribute '{attr}'"
        raise NotFoundError(msg)
    result = await ts.fetch_points(
        series.key,
        start=start,
        end=end,
        last=last,
        carry_forward=carry_forward,
        timezone=timezone,
        limit=limit,
    )
    tz = ZoneInfo(timezone or ts.default_timezone)
    return FetchPointsResultResponse(
        points=[
            DataPointResponse(
                timestamp=p.timestamp.astimezone(tz),
                value=p.value,
                command_id=p.command_id,
            )
            for p in result.points
        ],
        truncated=result.truncated,
        next_start=(
            result.next_start.astimezone(tz) if result.next_start is not None else None
        ),
    )


def get_aggregation_query(
    interval: str = Query(
        "auto",
        description=(
            "Bucket width: a duration string (e.g. '15min', '1h', '1d', '1mo'), "
            "'auto', 'raw' or 'whole'. When 'auto' or omitted, the server picks "
            "the best width for the period, falling back to 'whole' when the "
            "period is too short or too long for any of them. 'raw' returns the "
            "points unbucketed and applies no aggregation at all; 'whole' "
            "returns a single bucket spanning the [start, end) range."
        ),
        openapi_examples={
            "auto": {"value": "auto"},
            "raw": {"value": "raw"},
            "whole": {"value": "whole"},
            "15min": {"value": "15min"},
            "1h": {"value": "1h"},
            "1d": {"value": "1d"},
            "1mo": {"value": "1mo"},
        },
    ),
    agg: AggregationOperator = Query(
        ...,
        description=(
            "Aggregation operator. "
            "Note: 'avg' on bool series returns the sample mean of "
            "discrete observations (0.0 or 1.0 per point), "
            "which is rarely useful for event-driven series. "
            "Use 'tw_avg' to get the fraction of time the value was True. "
            "'delta' is the consumption of a cumulative counter (energy/water "
            "index) per bucket: the bucket's last value minus the last value "
            "before it, so consecutive buckets lose nothing in between. "
            "Buckets with no points have no value, and counter resets show up "
            "as negative deltas."
        ),
    ),
    start: datetime | None = Query(None),
    end: datetime | None = Query(None),
    last: str | None = Query(None),
    timezone: str | None = Query(None),
) -> AggregationQuery:
    try:
        return AggregationQuery.model_validate(
            {
                "interval": interval,
                "agg": agg,
                "start": start,
                "end": end,
                "last": last,
                "timezone": timezone,
            }
        )
    except ValidationError as e:
        msgs = (err["msg"].removeprefix("Value error, ") for err in e.errors())
        raise InvalidError("; ".join(msgs)) from e


@router.get(
    "/timeseries/aggregate/options",
    dependencies=[Depends(require_permission(Permission.TIMESERIES_READ))],
)
async def get_aggregate_options(
    start: datetime | None = Query(None),
    end: datetime | None = Query(None),
    last: str | None = Query(None),
    ts: TimeSeriesService = Depends(get_ts_service),
) -> AggregateOptionsResponse:
    options = await ts.get_aggregate_options(start=start, end=end, last=last)
    return AggregateOptionsResponse(
        intervals=[
            IntervalOption(interval=iv, bucket_count=bc) for iv, bc in options.intervals
        ],
        recommended_interval=options.recommended_interval,
        operators_by_data_type=options.operators_by_data_type,
        space_operators_by_data_type=options.space_operators_by_data_type,
    )


def get_target_query(
    types: list[str] | None = Query(None, alias="type"),
    ids: list[str] | None = Query(None),
    tags: list[str] | None = Query(None),
    attribute: str = Query(...),
) -> AttributeTarget:
    """Parse target query params — the same device-set vocabulary as
    ``GET /devices`` — into an :class:`AttributeTarget`."""
    return AttributeTarget(
        devices=DevicesFilter(ids=ids, types=types, tags=parse_tags_params(tags)),
        attribute=attribute,
    )


@router.get(
    "/timeseries/aggregate",
    dependencies=[Depends(require_permission(Permission.TIMESERIES_READ))],
)
async def get_devices_timeseries_aggregate(
    target: AttributeTarget = Depends(get_target_query),
    query: AggregationQuery = Depends(get_aggregation_query),
    space_agg: AggregationOperator = Query(
        ...,
        description=(
            "How each time bucket's values are folded across the device set, "
            "after `agg` reduced every device's readings over the bucket: "
            "'avg' of thermostat temperatures, 'sum' of meter consumptions, "
            "'mode' for the predominant state. Ordering-dependent and "
            "time-weighted operators (first/last/delta/tw_*) do not apply "
            "across devices and are rejected, as is `interval=raw`."
        ),
    ),
    group_by: str | None = Query(
        None,
        min_length=1,
        description=(
            "Tag key to bucket the device set by before folding: each tag "
            "value becomes its own group, folded independently with "
            "`space_agg`. Devices without the tag land in an 'untagged' "
            "group. Omit for the flat single-series result."
        ),
    ),
    resolver: CompositeTargetResolver = Depends(get_target_resolver),
    ts: TimeSeriesService = Depends(get_ts_service),
) -> SpaceAggregationResult | GroupedSpaceAggregationResult:
    """Aggregate one attribute over a device set into a single series.

    The target resolves at read time; devices whose history starts
    mid-window simply contribute to fewer buckets. The service's result is
    already wire-shaped — timestamps rendered in the timezone the buckets
    were cut in — so it serves as the response untouched.
    """
    if group_by is None:
        resolved = await resolver.resolve(target)
        keys = [
            SeriesKey(owner_id=device_id, metric=target.attribute)
            for device_id in resolved.device_ids
        ]
        return await ts.get_aggregate_many(keys, query, space_agg)
    _, devices = await resolver.resolve_with_devices(target)
    keys_by_group = {
        label: [
            SeriesKey(owner_id=device_id, metric=target.attribute)
            for device_id in device_ids
        ]
        for label, device_ids in group_device_ids_by_tag(devices, group_by).items()
    }
    return await ts.get_aggregate_many_grouped(keys_by_group, query, space_agg)


@router.get(
    "/timeseries/live-aggregate",
    dependencies=[Depends(require_permission(Permission.TIMESERIES_READ))],
)
async def get_devices_live_aggregate(
    target: AttributeTarget = Depends(get_target_query),
    space_agg: AggregationOperator = Query(
        ...,
        description=(
            "How the device set's current values are folded into one. Same "
            "space vocabulary as /timeseries/aggregate, applied directly to "
            "each device's live value instead of a time-aggregated series."
        ),
    ),
    group_by: str | None = Query(
        None,
        min_length=1,
        description=(
            "Tag key to bucket the device set by before folding. Same "
            "semantics as /timeseries/aggregate's `group_by`."
        ),
    ),
    resolver: CompositeTargetResolver = Depends(get_target_resolver),
    ts: TimeSeriesService = Depends(get_ts_service),
) -> LiveSpaceAggregateResponse | GroupedLiveAggregateResponse:
    """Fold one attribute's current value across a device set into one.

    ``space_agg`` is validated against the space vocabulary before the
    target resolves, so an invalid operator is rejected without paying for
    the ``list_devices`` scan. ``resolve_with_devices`` then avoids a second
    scan for the current values.
    """
    validate_space_operator(space_agg)
    resolved, devices = await resolver.resolve_with_devices(target)
    if group_by is None:
        current_values = [
            device.attributes[target.attribute].current_value for device in devices
        ]
        result = ts.fold_live_values(current_values, resolved.data_type, space_agg)
        return LiveSpaceAggregateResponse(
            value=result.value,
            data_type=result.data_type,
            space_agg=space_agg,
            device_count=result.device_count,
        )
    devices_by_id = {d.id: d for d in devices}
    values_by_group = {
        label: [
            devices_by_id[device_id].attributes[target.attribute].current_value
            for device_id in device_ids
        ]
        for label, device_ids in group_device_ids_by_tag(devices, group_by).items()
    }
    grouped = ts.fold_live_values_grouped(
        values_by_group, resolved.data_type, space_agg
    )
    return GroupedLiveAggregateResponse(
        data_type=grouped[0].data_type,
        space_agg=space_agg,
        groups=[
            LiveAggregateGroupResponse(
                label=g.label, value=g.value, device_count=g.device_count
            )
            for g in grouped
        ],
    )


@router.get(
    "/{device_id}/timeseries/{attr}/aggregate",
    dependencies=[Depends(require_permission(Permission.TIMESERIES_READ))],
)
async def get_device_timeseries_aggregate(
    device_id: str,
    attr: str,
    query: AggregationQuery = Depends(get_aggregation_query),
    dm: DevicesServiceInterface = Depends(get_device_manager),
    ts: TimeSeriesService = Depends(get_ts_service),
) -> AggregationResultResponse:
    dm.get_device(device_id)
    result = await ts.get_aggregate(SeriesKey(owner_id=device_id, metric=attr), query)
    tz = ZoneInfo(result.timezone)
    return AggregationResultResponse(
        interval=str(result.interval),
        agg=result.agg,
        data_type=result.data_type,
        aggregation_data_type=result.aggregation_data_type,
        timezone=result.timezone,
        truncated=result.truncated,
        points=[
            AggregatedPointResponse(
                interval_start=p.interval_start.astimezone(tz),
                value=p.value,
                count=p.count,
            )
            for p in result.points
        ],
    )
