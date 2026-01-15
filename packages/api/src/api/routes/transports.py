import uuid
from typing import Annotated

from core import TransportClient
from core.devices_manager import DevicesManager
from dto.transport_dto import (
    CONFIG_CLASS_BY_PROTOCOL,
    TransportCreateDTO,
    TransportDTO,
    TransportUpdateDTO,
    build_dto,
    core_to_dto,
    dto_to_core,
)
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import ValidationError
from storage import CoreFileStorage

from api.dependencies import get_device_manager, get_repository

router = APIRouter()


def _get_client(dm: DevicesManager, transport_id: str) -> TransportClient:
    try:
        return dm.transports[transport_id]
    except KeyError as e:
        raise HTTPException(
            status_code=404, detail=f"Transport {transport_id} not found"
        ) from e


@router.get("/")
def list_transports(
    dm: Annotated[DevicesManager, Depends(get_device_manager)],
) -> list[TransportDTO]:
    return [core_to_dto(tc) for tc in dm.transports.values()]


@router.get("/{transport_id}", name="get_transport")
def get_transport(
    transport_id: str, dm: Annotated[DevicesManager, Depends(get_device_manager)]
) -> TransportDTO:
    tc = _get_client(dm, transport_id)
    return core_to_dto(tc)


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
    repository.transports.write(dto.id, dto)
    return dto


@router.patch("/{transport_id}")
async def update_transport(  # noqa: PLR0913
    transport_id: str,
    update_payload: TransportUpdateDTO,
    dm: Annotated[DevicesManager, Depends(get_device_manager)],
    repository: Annotated[CoreFileStorage, Depends(get_repository)],
    request: Request,
    response: Response,
) -> TransportDTO:
    client = _get_client(dm, transport_id)
    try:
        if update_payload.name:
            client.metadata.name = update_payload.name
        if update_payload.config:
            new_config = client.config.model_copy(update=update_payload.config)
            client.update_config(new_config)
        dto = core_to_dto(client)
    except ValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=e.errors()
        ) from e
    repository.transports.write(dto.id, dto)
    response.headers["Location"] = str(
        request.url_for("get_transport", transport_id=transport_id)
    )
    return dto


@router.delete("/{transport_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_transport(
    transport_id: str,
    dm: Annotated[DevicesManager, Depends(get_device_manager)],
    repository: Annotated[CoreFileStorage, Depends(get_repository)],
) -> None:
    client = _get_client(dm, transport_id)
    for device in dm.devices.values():
        if device.transport.metadata.id == transport_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Transport {transport_id} is in use by device {device.id}",
            )
    await client.close()
    del dm.transports[transport_id]
    repository.transports.delete(transport_id)


@router.get("/schemas/")
def get_transport_schemas() -> dict[str, dict]:
    return {
        protocol: config_class.model_json_schema()
        for protocol, config_class in CONFIG_CLASS_BY_PROTOCOL.items()
    }
