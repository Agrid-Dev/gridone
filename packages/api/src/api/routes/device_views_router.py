from fastapi import APIRouter, Depends, Request, status

from api.auth import require_permission
from device_views import DeviceView, DeviceViewInput, DeviceViewsService
from users.permissions import Permission

router = APIRouter()


def get_device_views_service(request: Request) -> DeviceViewsService:
    return request.app.state.device_views_service


@router.get("", dependencies=[Depends(require_permission(Permission.DEVICES_READ))])
async def list_device_views(
    service: DeviceViewsService = Depends(get_device_views_service),
) -> list[DeviceView]:
    return await service.list()


@router.get(
    "/{view_id}", dependencies=[Depends(require_permission(Permission.DEVICES_READ))]
)
async def get_device_view(
    view_id: str, service: DeviceViewsService = Depends(get_device_views_service)
) -> DeviceView:
    return await service.get(view_id)


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission(Permission.DEVICES_WRITE))],
)
async def create_device_view(
    body: DeviceViewInput,
    service: DeviceViewsService = Depends(get_device_views_service),
) -> DeviceView:
    return await service.create(body)


@router.put(
    "/{view_id}", dependencies=[Depends(require_permission(Permission.DEVICES_WRITE))]
)
async def update_device_view(
    view_id: str,
    body: DeviceViewInput,
    service: DeviceViewsService = Depends(get_device_views_service),
) -> DeviceView:
    return await service.update(view_id, body)


@router.delete(
    "/{view_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permission(Permission.DEVICES_WRITE))],
)
async def delete_device_view(
    view_id: str, service: DeviceViewsService = Depends(get_device_views_service)
) -> None:
    await service.delete(view_id)
