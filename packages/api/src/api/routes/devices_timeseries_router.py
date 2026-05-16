from datetime import datetime

from devices_manager import DevicesServiceInterface
from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from models.errors import InvalidError, NotFoundError
from pydantic import BaseModel, ValidationError
from timeseries.domain import (
    AggregationOperator,
    AggregationQuery,
    Interval,
    SeriesKey,
)
from timeseries.service import TimeSeriesService

from api.dependencies import get_device_manager, get_ts_service, require_permission
from api.permissions import Permission
from api.schemas.timeseries import (
    AggregatedPointResponse,
    AggregationResultResponse,
    DataPointResponse,
    TimeSeriesResponse,
)

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
    carry_forward: bool = Query(True),
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
    carry_forward: bool = Query(False),
    dm: DevicesServiceInterface = Depends(get_device_manager),
    ts: TimeSeriesService = Depends(get_ts_service),
) -> list[DataPointResponse]:
    dm.get_device(device_id)
    series = await ts.get_series_by_key(SeriesKey(owner_id=device_id, metric=attr))
    if series is None:
        raise NotFoundError(
            f"No timeseries found for device '{device_id}', attribute '{attr}'"
        )
    points = await ts.fetch_points(
        series.key, start=start, end=end, last=last, carry_forward=carry_forward
    )
    return [
        DataPointResponse(timestamp=p.timestamp, value=p.value, command_id=p.command_id)
        for p in points
    ]


def get_aggregation_query(
    interval: Interval = Query(...),
    agg: AggregationOperator = Query(...),
    start: datetime | None = Query(None),
    end: datetime | None = Query(None),
    last: str | None = Query(None),
    timezone: str | None = Query(None),
) -> AggregationQuery:
    try:
        return AggregationQuery(
            interval=interval,
            agg=agg,
            start=start,
            end=end,
            last=last,
            timezone=timezone,
        )
    except ValidationError as e:
        raise InvalidError("; ".join(err["msg"] for err in e.errors())) from e


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
    return AggregationResultResponse(
        interval=result.interval,
        agg=result.agg,
        data_type=result.data_type,
        aggregation_data_type=result.aggregation_data_type,
        timezone=result.timezone,
        points=[
            AggregatedPointResponse(
                interval_start=p.interval_start,
                value=p.value,
                count=p.count,
            )
            for p in result.points
        ],
    )
