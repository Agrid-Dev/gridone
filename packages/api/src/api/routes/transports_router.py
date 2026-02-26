from typing import Annotated

from devices_manager import DevicesManager
from devices_manager.dto import (
    TRANSPORT_CONFIG_CLASS_BY_PROTOCOL,
    TransportCreateDTO,
    TransportDTO,
    TransportUpdateDTO,
)
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import ValidationError

from users import Permission
from api.dependencies import get_device_manager, require_permission

from .discovery_router import router as discovery_router

router = APIRouter()

router.include_router(
    discovery_router, prefix="/{transport_id}/discovery", tags=["discovery"]
)

_read = Depends(require_permission(Permission.TRANSPORTS_READ))
_manage = Depends(require_permission(Permission.TRANSPORTS_MANAGE))


@router.get("/")
def list_transports(
    _: Annotated[str, _read],
    dm: Annotated[DevicesManager, Depends(get_device_manager)],
) -> list[TransportDTO]:
    return dm.list_transports()


@router.get("/{transport_id}", name="get_transport")
def get_transport(
    transport_id: str,
    _: Annotated[str, _read],
    dm: Annotated[DevicesManager, Depends(get_device_manager)],
) -> TransportDTO:
    return dm.get_transport(transport_id)


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_transport(
    payload: TransportCreateDTO,
    _: Annotated[str, _manage],
    dm: Annotated[DevicesManager, Depends(get_device_manager)],
    request: Request,
    response: Response,
) -> TransportDTO:
    dto = await dm.add_transport(payload)
    response.headers["Location"] = str(
        request.url_for("get_transport", transport_id=dto.id)
    )
    return dto


@router.patch("/{transport_id}")
async def update_transport(
    transport_id: str,
    update_payload: TransportUpdateDTO,
    _: Annotated[str, _manage],
    dm: Annotated[DevicesManager, Depends(get_device_manager)],
    request: Request,
    response: Response,
) -> TransportDTO:
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


@router.delete("/{transport_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_transport(
    transport_id: str,
    _: Annotated[str, _manage],
    dm: Annotated[DevicesManager, Depends(get_device_manager)],
) -> None:
    await dm.delete_transport(transport_id)


@router.get("/schemas/")
def get_transport_schemas(
    _: Annotated[str, _read],
) -> dict[str, dict]:
    return {
        protocol: config_class.model_json_schema()
        for protocol, config_class in TRANSPORT_CONFIG_CLASS_BY_PROTOCOL.items()
    }
