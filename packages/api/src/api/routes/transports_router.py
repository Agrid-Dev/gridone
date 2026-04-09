from typing import Annotated

from devices_manager import DevicesManagerInterface
from devices_manager.dto import (
    TRANSPORT_CONFIG_CLASS_BY_PROTOCOL,
    TransportCreate,
    Transport,
    TransportUpdate,
)
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import ValidationError

from api.dependencies import get_device_manager, require_permission
from api.permissions import Permission

from .discovery_router import router as discovery_router

router = APIRouter()

router.include_router(
    discovery_router, prefix="/{transport_id}/discovery", tags=["discovery"]
)


@router.get("/", dependencies=[Depends(require_permission(Permission.TRANSPORTS_READ))])
def list_transports(
    dm: Annotated[DevicesManagerInterface, Depends(get_device_manager)],
) -> list[Transport]:
    return dm.list_transports()


@router.get(
    "/{transport_id}",
    name="get_transport",
    dependencies=[Depends(require_permission(Permission.TRANSPORTS_READ))],
)
def get_transport(
    transport_id: str,
    dm: Annotated[DevicesManagerInterface, Depends(get_device_manager)],
) -> Transport:
    return dm.get_transport(transport_id)


@router.post(
    "/",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission(Permission.TRANSPORTS_WRITE))],
)
async def create_transport(
    payload: TransportCreate,
    dm: Annotated[DevicesManagerInterface, Depends(get_device_manager)],
    request: Request,
    response: Response,
) -> Transport:
    dto = await dm.add_transport(payload)
    response.headers["Location"] = str(
        request.url_for("get_transport", transport_id=dto.id)
    )
    return dto


@router.patch(
    "/{transport_id}",
    dependencies=[Depends(require_permission(Permission.TRANSPORTS_WRITE))],
)
async def update_transport(
    transport_id: str,
    update_payload: TransportUpdate,
    dm: Annotated[DevicesManagerInterface, Depends(get_device_manager)],
    request: Request,
    response: Response,
) -> Transport:
    try:
        transport = await dm.update_transport(transport_id, update_payload)
    except ValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=e.errors()
        ) from e
    response.headers["Location"] = str(
        request.url_for("get_transport", transport_id=transport_id)
    )
    return transport


@router.delete(
    "/{transport_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permission(Permission.TRANSPORTS_WRITE))],
)
async def delete_transport(
    transport_id: str,
    dm: Annotated[DevicesManagerInterface, Depends(get_device_manager)],
) -> None:
    await dm.delete_transport(transport_id)


@router.get(
    "/schemas/", dependencies=[Depends(require_permission(Permission.TRANSPORTS_READ))]
)
def get_transport_schemas() -> dict[str, dict]:
    return {
        protocol: config_class.model_json_schema()
        for protocol, config_class in TRANSPORT_CONFIG_CLASS_BY_PROTOCOL.items()
    }
