import uuid
from typing import Annotated

from core.devices_manager import DevicesManager
from dto.transport import (
    TransportCreateDTO,
    TransportDTO,
    build_dto,
    core_to_dto,
    dto_to_core,
)
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from storage import CoreFileStorage

from api.dependencies import get_device_manager, get_repository

router = APIRouter()


@router.get("/")
def list_transports(
    dm: Annotated[DevicesManager, Depends(get_device_manager)],
) -> list[TransportDTO]:
    return [core_to_dto(tc) for tc in dm.transports.values()]


@router.get("/{transport_id}", name="get_transport")
def get_transport(
    transport_id: str, dm: Annotated[DevicesManager, Depends(get_device_manager)]
) -> TransportDTO:
    try:
        tc = dm.transports[transport_id]
        return core_to_dto(tc)
    except KeyError as e:
        raise HTTPException(status_code=404, detail="Transport not found") from e


def gen_id() -> str:
    """Temporary id generator: will be handled by storage"""
    return str(uuid.uuid4())[:8]


@router.post("/", status_code=status.HTTP_201_CREATED)
def create_transport(
    payload: TransportCreateDTO,
    dm: Annotated[DevicesManager, Depends(get_device_manager)],
    repository: Annotated[CoreFileStorage, Depends(get_repository)],
    request: Request,
    response: Response,
) -> TransportDTO:
    transport_id = gen_id()
    dto = build_dto(
        transport_id, payload.name or transport_id, payload.protocol, payload.config
    )

    tc = dto_to_core(dto)
    dm.transports[tc.metadata.id] = tc

    response.headers["Location"] = str(
        request.url_for("get_transport", transport_id=transport_id)
    )
    repository.transports.write(dto.id, dto.model_dump(mode="json"))
    return dto
