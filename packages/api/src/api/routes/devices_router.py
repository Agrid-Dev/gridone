import logging
from datetime import UTC, datetime
from typing import Annotated

from devices_manager import DevicesManager
from devices_manager.dto import StandardAttributeSchemaDTO
from devices_manager.dto.device_dto import (
    DeviceCreateDTO,
    DeviceDTO,
    DeviceUpdateDTO,
)
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import Response
from models.errors import InvalidError, NotFoundError
from models.pagination import PaginationParams
from pydantic import BaseModel
from timeseries.domain import (
    CommandStatus,
    DataPoint,
    DeviceCommand,
    DeviceCommandCreate,
    SeriesKey,
)
from timeseries.service import TimeSeriesService

from api.dependencies import (
    get_current_user_id,
    get_device_manager,
    get_pagination_params,
    get_ts_service,
    require_permission,
)
from api.permissions import Permission
from api.schemas.device import (
    AttributeUpdate,
    CommandsQuery,
    SingleAttrTimeseriesPushPoint,
    TimeseriesBulkPushRequest,
    TimeseriesSingleAttrPushRequest,
    get_commands_query,
)
from api.schemas.pagination import PaginatedResponse, to_paginated_response
from api.schemas.timeseries import DataPointResponse, TimeSeriesResponse

logger = logging.getLogger(__name__)


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


@router.get("/", dependencies=[Depends(require_permission(Permission.DEVICES_READ))])
def list_devices(
    dm: DevicesManager = Depends(get_device_manager),
    device_type: str | None = Query(None, alias="type"),
) -> list[DeviceDTO]:
    return dm.list_devices(device_type=device_type)


@router.get(
    "/standard-types",
    dependencies=[Depends(require_permission(Permission.DEVICES_READ))],
)
def get_standard_types(
    dm: Annotated[DevicesManager, Depends(get_device_manager)],
) -> list[StandardAttributeSchemaDTO]:
    return dm.list_standard_schemas()


@router.get(
    "/commands", dependencies=[Depends(require_permission(Permission.DEVICES_READ))]
)
async def get_commands(
    request: Request,
    query: CommandsQuery = Depends(get_commands_query),
    pagination: PaginationParams = Depends(get_pagination_params),
    ts: TimeSeriesService = Depends(get_ts_service),
) -> PaginatedResponse[DeviceCommand]:
    page = await ts.get_commands(
        ids=query.ids,
        device_id=query.device_id,
        attribute=query.attribute,
        user_id=query.user_id,
        start=query.start,
        end=query.end,
        last=query.last,
        sort=query.sort,
        pagination=pagination,
    )
    return to_paginated_response(page, str(request.url))


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
    dm: DevicesManager = Depends(get_device_manager),
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
    dm: DevicesManager = Depends(get_device_manager),
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


@router.get(
    "/{device_id}", dependencies=[Depends(require_permission(Permission.DEVICES_READ))]
)
def get_device(
    device_id: str,
    dm: DevicesManager = Depends(get_device_manager),
) -> DeviceDTO:
    return dm.get_device(device_id)


@router.get(
    "/{device_id}/commands",
    dependencies=[Depends(require_permission(Permission.DEVICES_READ))],
)
async def get_device_commands(
    device_id: str,
    request: Request,
    query: CommandsQuery = Depends(get_commands_query),
    pagination: PaginationParams = Depends(get_pagination_params),
    ts: TimeSeriesService = Depends(get_ts_service),
) -> PaginatedResponse[DeviceCommand]:
    page = await ts.get_commands(
        ids=query.ids,
        device_id=device_id,
        attribute=query.attribute,
        user_id=query.user_id,
        start=query.start,
        end=query.end,
        last=query.last,
        sort=query.sort,
        pagination=pagination,
    )
    return to_paginated_response(page, str(request.url))


@router.post(
    "/",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission(Permission.DEVICES_WRITE))],
)
async def create_device(
    dto: DeviceCreateDTO,
    dm: Annotated[DevicesManager, Depends(get_device_manager)],
) -> DeviceDTO:
    return await dm.add_device(dto)


@router.patch(
    "/{device_id}", dependencies=[Depends(require_permission(Permission.DEVICES_WRITE))]
)
async def update_device(
    device_id: str,
    payload: DeviceUpdateDTO,
    dm: Annotated[DevicesManager, Depends(get_device_manager)],
) -> DeviceDTO:
    try:
        device = await dm.update_device(device_id, payload)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return device


@router.delete(
    "/{device_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permission(Permission.DEVICES_WRITE))],
)
async def delete_device(
    device_id: str,
    dm: Annotated[DevicesManager, Depends(get_device_manager)],
):
    await dm.delete_device(device_id)
    return


def _to_data_points(points: list[SingleAttrTimeseriesPushPoint]) -> list[DataPoint]:
    return [DataPoint(timestamp=p.timestamp, value=p.value) for p in points]


@router.post(
    "/{device_id}/timeseries",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permission(Permission.DEVICES_WRITE))],
)
async def push_device_timeseries(
    device_id: str,
    body: TimeseriesBulkPushRequest,
    dm: DevicesManager = Depends(get_device_manager),
    ts: TimeSeriesService = Depends(get_ts_service),
) -> None:
    device_dto = dm.get_device(device_id)
    for p in body.data:
        if p.attribute not in device_dto.attributes:
            raise HTTPException(
                status_code=404,
                detail=f"Attribute '{p.attribute}' not found on device {device_id}",
            )
    grouped: dict[str, list[DataPoint]] = {}
    for p in body.data:
        grouped.setdefault(p.attribute, []).append(
            DataPoint(timestamp=p.timestamp, value=p.value)
        )
    for attr_name, points in grouped.items():
        await ts.upsert_points(
            SeriesKey(owner_id=device_id, metric=attr_name),
            points,
            create_if_not_found=True,
            validate_data_type=device_dto.attributes[attr_name].data_type,
        )


@router.post(
    "/{device_id}/timeseries/{attr_name}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permission(Permission.DEVICES_WRITE))],
)
async def push_device_attribute_timeseries(
    device_id: str,
    attr_name: str,
    body: TimeseriesSingleAttrPushRequest,
    dm: DevicesManager = Depends(get_device_manager),
    ts: TimeSeriesService = Depends(get_ts_service),
) -> None:
    device_dto = dm.get_device(device_id)
    if attr_name not in device_dto.attributes:
        raise HTTPException(
            status_code=404,
            detail=f"Attribute '{attr_name}' not found on device {device_id}",
        )
    points = _to_data_points(body.data)
    await ts.upsert_points(
        SeriesKey(owner_id=device_id, metric=attr_name),
        points,
        create_if_not_found=True,
        validate_data_type=device_dto.attributes[attr_name].data_type,
    )


@router.post(
    "/{device_id}/{attribute_name}",
    dependencies=[Depends(require_permission(Permission.DEVICES_WRITE))],
)
async def update_attribute(
    device_id: str,
    attribute_name: str,
    update: AttributeUpdate,
    confirm: bool = True,
    dm: DevicesManager = Depends(get_device_manager),
    ts: TimeSeriesService = Depends(get_ts_service),
    user_id: str = Depends(get_current_user_id),
) -> AttributeUpdate:
    data_type = dm.get_device(device_id).attributes[attribute_name].data_type

    def make_command(
        status: CommandStatus, status_details: str | None = None
    ) -> DeviceCommandCreate:
        return DeviceCommandCreate(
            device_id=device_id,
            attribute=attribute_name,
            user_id=user_id,
            value=update.value,
            data_type=data_type,
            timestamp=datetime.now(UTC),
            status=status,
            status_details=status_details,
        )

    try:
        attribute = await dm.write_device_attribute(
            device_id, attribute_name, update.value, confirm=confirm
        )
        command = await ts.log_command(make_command(CommandStatus.SUCCESS))
        await ts.upsert_points(
            SeriesKey(owner_id=device_id, metric=attribute_name),
            [
                DataPoint(
                    timestamp=attribute.last_changed or datetime.now(UTC),
                    value=update.value,
                    command_id=command.id,
                )
            ],
            create_if_not_found=True,
        )

    except (TypeError, PermissionError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        if not isinstance(e, (NotFoundError, InvalidError)):
            await ts.log_command(make_command(CommandStatus.ERROR, str(e)))
        raise e
    return update
