from typing import Annotated

from core.devices_manager import DevicesManager
from fastapi import APIRouter, Depends, HTTPException, Path, status
from pydantic import BaseModel

from api.dependencies import get_device_manager


class DiscoveryHandlerCreateDTO(BaseModel):
    driver_id: str


class DiscoveryHandlerDTO(DiscoveryHandlerCreateDTO):
    transport_id: str


router = APIRouter()


def get_transport_id(transport_id: str = Path(...)) -> str:
    """Used to get transport_id from path (parent route)"""
    return transport_id


@router.get("/")
def list_discoveries(
    dm: Annotated[DevicesManager, Depends(get_device_manager)],
    transport_id: Annotated[str, Depends(get_transport_id)],
) -> list[DiscoveryHandlerDTO]:
    return [
        DiscoveryHandlerDTO.model_validate(d)
        for d in dm.discovery_manager.list(transport_id=transport_id)
    ]


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_discovery(
    dm: Annotated[DevicesManager, Depends(get_device_manager)],
    payload: DiscoveryHandlerCreateDTO,
    transport_id: Annotated[str, Depends(get_transport_id)],
) -> DiscoveryHandlerDTO:
    if payload.driver_id not in dm.drivers:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Driver not found"
        )
    if transport_id not in dm.transports:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Driver not found"
        )
    try:
        await dm.discovery_manager.register(
            driver_id=payload.driver_id, transport_id=transport_id
        )
    except TypeError as te:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(te)
        )
    return DiscoveryHandlerDTO(driver_id=payload.driver_id, transport_id=transport_id)


@router.delete("/{driver_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_discovery(
    dm: Annotated[DevicesManager, Depends(get_device_manager)],
    transport_id: Annotated[str, Depends(get_transport_id)],
    driver_id: str,
):
    try:
        await dm.discovery_manager.unregister(
            driver_id=driver_id, transport_id=transport_id
        )
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Driver not found"
        )
