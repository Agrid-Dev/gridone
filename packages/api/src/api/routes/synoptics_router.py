from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request, status
from pydantic import AwareDatetime

from api.auth import require_permission
from api.dependencies import (
    get_pagination_params,
    get_synoptics_service,
)
from api.permissions import Permission
from api.schemas.pagination import PaginatedResponse, to_paginated_response
from models.pagination import PaginationParams
from synoptics import (
    ENVELOPE_FIELDS,
    Synoptic,
    SynopticDocument,
    SynopticsServiceInterface,
    SynopticSummary,
)

router = APIRouter()

_ServiceDep = Annotated[SynopticsServiceInterface, Depends(get_synoptics_service)]


# ``/symbol-schemas`` is declared before ``/{synoptic_id}`` so the literal path
# isn't captured by the id path parameter.
@router.get(
    "/symbol-schemas",
    dependencies=[Depends(require_permission(Permission.SYNOPTICS_READ))],
)
def get_symbol_schemas(svc: _ServiceDep) -> dict[str, dict[str, Any]]:
    return svc.symbol_schemas()


@router.get(
    "/",
    dependencies=[Depends(require_permission(Permission.SYNOPTICS_READ))],
)
async def list_synoptics(
    request: Request,
    svc: _ServiceDep,
    pagination: Annotated[PaginationParams, Depends(get_pagination_params)],
) -> PaginatedResponse[SynopticSummary]:
    page = await svc.list(pagination=pagination)
    return to_paginated_response(page, str(request.url))


@router.post(
    "/",
    response_model=Synoptic,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission(Permission.SYNOPTICS_WRITE))],
)
async def create_synoptic(body: SynopticDocument, svc: _ServiceDep) -> Synoptic:
    return await svc.create(body)


@router.get(
    "/{synoptic_id}",
    response_model=Synoptic,
    dependencies=[Depends(require_permission(Permission.SYNOPTICS_READ))],
)
async def get_synoptic(synoptic_id: str, svc: _ServiceDep) -> Synoptic:
    return await svc.get(synoptic_id)


@router.get(
    "/{synoptic_id}/export",
    dependencies=[Depends(require_permission(Permission.SYNOPTICS_READ))],
)
async def export_synoptic(synoptic_id: str, svc: _ServiceDep) -> SynopticDocument:
    """The authored document alone, so the file is a valid create payload."""
    synoptic = await svc.get(synoptic_id)
    return SynopticDocument.model_validate(
        synoptic.model_dump(by_alias=True, exclude=ENVELOPE_FIELDS)
    )


@router.put(
    "/{synoptic_id}",
    response_model=Synoptic,
    dependencies=[Depends(require_permission(Permission.SYNOPTICS_WRITE))],
)
async def replace_synoptic(
    synoptic_id: str,
    body: SynopticDocument,
    svc: _ServiceDep,
    expected_updated_at: AwareDatetime | None = None,
) -> Synoptic:
    """``expected_updated_at`` is the ``updated_at`` the author read, offset
    included; the save is refused (409) if the plate moved since."""
    return await svc.replace(synoptic_id, body, expected_updated_at=expected_updated_at)


@router.delete(
    "/{synoptic_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permission(Permission.SYNOPTICS_WRITE))],
)
async def delete_synoptic(synoptic_id: str, svc: _ServiceDep) -> None:
    await svc.delete(synoptic_id)
