import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import ValidationError

from api.auth import require_permission
from api.dependencies import get_device_manager
from api.permissions import Permission
from devices_manager import DevicesServiceInterface, IngressRequest, IngressResult
from devices_manager.dto import (
    TRANSPORT_CONFIG_CLASS_BY_PROTOCOL,
    Transport,
    TransportCreate,
    TransportUpdate,
)
from models.errors import validation_details, validation_error_items

from .discovery_router import router as discovery_router

# The ingress endpoint is public (transport-level auth, no JWT), so it gets
# its own logger to keep an auditable trail of what is pushed from outside.
ingress_logger = logging.getLogger("api.ingress")

MAX_INGRESS_BODY_BYTES = 1024 * 1024

router = APIRouter()

router.include_router(
    discovery_router, prefix="/{transport_id}/discovery", tags=["discovery"]
)

# Mounted separately in app.py, without the blanket JWT dependency: ingress is
# device-level ingestion (like MQTT or BACnet), authenticated by the transport
# itself from its config — not by the API's user-authorization flow.
ingress_router = APIRouter()


async def _read_limited_body(request: Request) -> bytes:
    """Read the request body, rejecting anything over MAX_INGRESS_BODY_BYTES.

    The endpoint is unauthenticated until the transport checks credentials,
    so the body is streamed with a hard cap instead of buffered blindly.
    """
    if int(request.headers.get("content-length") or 0) > MAX_INGRESS_BODY_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE, detail="Payload too large"
        )
    chunks: list[bytes] = []
    received = 0
    async for chunk in request.stream():
        received += len(chunk)
        if received > MAX_INGRESS_BODY_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail="Payload too large",
            )
        chunks.append(chunk)
    return b"".join(chunks)


@ingress_router.post(
    "/{transport_id}/ingress/{topic:path}",
    responses={
        status.HTTP_401_UNAUTHORIZED: {"description": "Invalid push credentials"},
        status.HTTP_404_NOT_FOUND: {"description": "Unknown or non-ingress transport"},
        status.HTTP_413_CONTENT_TOO_LARGE: {"description": "Payload over 1 MiB"},
    },
)
async def ingress_message(
    transport_id: str,
    topic: str,
    request: Request,
    dm: Annotated[DevicesServiceInterface, Depends(get_device_manager)],
) -> IngressResult:
    """Push a message to a transport's topic. ``matched: 0`` is a valid
    response (e.g. a push racing device provisioning), not an error."""
    payload = await _read_limited_body(request)
    target = dm.get_transport_ingress(transport_id)
    result = await target.ingress(
        IngressRequest(
            topic=topic,
            payload=payload,
            headers={k.lower(): v for k, v in request.headers.items()},
            query=dict(request.query_params),
        )
    )
    # Nominal pushes stay at debug (an app pushing every few seconds would
    # flood the log); an unmatched topic is the case worth surfacing.
    log = ingress_logger.info if result.matched == 0 else ingress_logger.debug
    log(
        "Ingress on transport %s topic %s: %d bytes, %d listener(s) matched",
        transport_id,
        topic,
        len(payload),
        result.matched,
    )
    return result


@router.get("/", dependencies=[Depends(require_permission(Permission.TRANSPORTS_READ))])
def list_transports(
    dm: Annotated[DevicesServiceInterface, Depends(get_device_manager)],
) -> list[Transport]:
    return dm.list_transports()


@router.get(
    "/{transport_id}",
    name="get_transport",
    dependencies=[Depends(require_permission(Permission.TRANSPORTS_READ))],
)
def get_transport(
    transport_id: str,
    dm: Annotated[DevicesServiceInterface, Depends(get_device_manager)],
) -> Transport:
    return dm.get_transport(transport_id)


@router.post(
    "/",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission(Permission.TRANSPORTS_WRITE))],
)
async def create_transport(
    payload: TransportCreate,
    dm: Annotated[DevicesServiceInterface, Depends(get_device_manager)],
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
    dm: Annotated[DevicesServiceInterface, Depends(get_device_manager)],
    request: Request,
    response: Response,
) -> Transport:
    try:
        transport = await dm.update_transport(transport_id, update_payload)
    except ValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=validation_details(validation_error_items(e)),
        ) from e
    response.headers["Location"] = str(
        request.url_for("get_transport", transport_id=transport_id)
    )
    return transport


@router.post(
    "/{transport_id}/reconnect",
    dependencies=[Depends(require_permission(Permission.TRANSPORTS_WRITE))],
)
async def reconnect_transport(
    transport_id: str,
    dm: Annotated[DevicesServiceInterface, Depends(get_device_manager)],
) -> Transport:
    """Re-arm a transport parked after a terminal connection failure."""
    return await dm.reconnect_transport(transport_id)


@router.delete(
    "/{transport_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permission(Permission.TRANSPORTS_WRITE))],
)
async def delete_transport(
    transport_id: str,
    dm: Annotated[DevicesServiceInterface, Depends(get_device_manager)],
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
