from typing import Annotated

from devices_manager import DevicesManager
from devices_manager.dto import (
    TRANSPORT_CONFIG_CLASS_BY_PROTOCOL,
    TransportCreateDTO,
    TransportDTO,
    TransportUpdateDTO,
)
from devices_manager.errors import NotFoundError, ForbiddenError
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import ValidationError

from api.dependencies import get_device_manager

from .discovery_router import router as discovery_router

router = APIRouter()

router.include_router(
    discovery_router, prefix="/{transport_id}/discovery", tags=["discovery"]
)


def _get_client(dm: DevicesManager, transport_id: str) -> TransportDTO:
    try:
        return dm.get_transport(transport_id)
    except NotFoundError as e:
        raise HTTPException(
            status_code=404, detail=f"Transport {transport_id} not found"
        ) from e


@router.get("/")
def list_transports(
    dm: Annotated[DevicesManager, Depends(get_device_manager)],
) -> list[TransportDTO]:
    return dm.list_transports()


@router.get("/{transport_id}", name="get_transport")
def get_transport(
    transport_id: str, dm: Annotated[DevicesManager, Depends(get_device_manager)]
) -> TransportDTO:
    return _get_client(dm, transport_id)


@router.post("/", status_code=status.HTTP_201_CREATED)
def create_transport(
    payload: TransportCreateDTO,
    dm: Annotated[DevicesManager, Depends(get_device_manager)],
    request: Request,
    response: Response,
) -> TransportDTO:
    dto = dm.add_transport(payload)
    response.headers["Location"] = str(
        request.url_for("get_transport", transport_id=dto.id)
    )
    return dto


@router.patch("/{transport_id}")
async def update_transport(
    transport_id: str,
    update_payload: TransportUpdateDTO,
    dm: Annotated[DevicesManager, Depends(get_device_manager)],
    request: Request,
    response: Response,
) -> TransportDTO:
    try:
        transport = await dm.update_transport(transport_id, update_payload)
    except NotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Transport {transport_id} not found",
        ) from e
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
    dm: Annotated[DevicesManager, Depends(get_device_manager)],
) -> None:
    try:
        await dm.delete_transport(transport_id)
    except NotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Transport {transport_id} not found",
        ) from e
    except ForbiddenError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e)) from e


@router.get("/schemas/")
def get_transport_schemas() -> dict[str, dict]:
    return {
        protocol: config_class.model_json_schema()
        for protocol, config_class in TRANSPORT_CONFIG_CLASS_BY_PROTOCOL.items()
    }
