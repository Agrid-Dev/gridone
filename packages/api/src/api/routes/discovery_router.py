from typing import Annotated

from devices_manager import DevicesManager
from fastapi import APIRouter, Depends, HTTPException, Path, status
from pydantic import BaseModel

from api.dependencies import get_device_manager


class DiscoveryHandlerCreateDTO(BaseModel):
    driver_id: str


class DiscoveryHandlerDTO(DiscoveryHandlerCreateDTO):
    transport_id: str
    enabled: bool


router = APIRouter()


def get_transport_id(transport_id: str = Path(...)) -> str:
    """Used to get transport_id from path (parent route)"""
    return transport_id


@router.get("/")
def list_discoveries(
    dm: Annotated[DevicesManager, Depends(get_device_manager)],
    transport_id: Annotated[str, Depends(get_transport_id)],
) -> list[DiscoveryHandlerDTO]:
    if transport_id not in dm.transport_ids:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Transport not found"
        )
    return [
        DiscoveryHandlerDTO(
            driver_id=driver.id,
            transport_id=transport_id,
            enabled=dm.discovery_manager.has(driver.id, transport_id),
        )
        for driver in dm.list_drivers()
        if driver.transport == dm.get_transport(transport_id).protocol
        and driver.discovery is not None
    ]


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_discovery(
    dm: Annotated[DevicesManager, Depends(get_device_manager)],
    payload: DiscoveryHandlerCreateDTO,
    transport_id: Annotated[str, Depends(get_transport_id)],
) -> DiscoveryHandlerDTO:
    if payload.driver_id not in dm.driver_ids:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Driver not found"
        )
    if transport_id not in dm.transport_ids:
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
    return DiscoveryHandlerDTO(
        driver_id=payload.driver_id, transport_id=transport_id, enabled=True
    )


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
