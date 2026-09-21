"""Administer site protections independently of automation execution."""

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Request, status
from pydantic import BaseModel, ConfigDict, Field

from api.auth import get_current_user_id, require_permission
from api.permissions import Permission
from models.protections import (
    NonBlank,
    Protection,
    ProtectionDefinition,
    ProtectionRetirement,
    ProtectionView,
)
from protections import ProtectionsService

router = APIRouter()


def get_protections_service(request: Request) -> ProtectionsService:
    return request.app.state.protections_service


ServiceDep = Annotated[ProtectionsService, Depends(get_protections_service)]
ActorDep = Annotated[str, Depends(get_current_user_id)]


class UpdateProtection(ProtectionDefinition):
    revision: int = Field(ge=1)


class RetireProtection(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: NonBlank
    revision: int = Field(ge=1)


@router.get(
    "/", dependencies=[Depends(require_permission(Permission.PROTECTIONS_READ))]
)
async def list_protections(service: ServiceDep) -> list[ProtectionView]:
    return service.list_protections()


@router.post(
    "/",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission(Permission.PROTECTIONS_WRITE))],
)
async def create_protection(
    body: ProtectionDefinition, service: ServiceDep, actor: ActorDep
) -> Protection:
    return await service.create(body, actor)


@router.get(
    "/{protection_id}",
    dependencies=[Depends(require_permission(Permission.PROTECTIONS_READ))],
)
async def get_protection(protection_id: str, service: ServiceDep) -> ProtectionView:
    protection = service.get(protection_id)
    return ProtectionView(protection=protection, reasons=service.diagnose(protection))


@router.get(
    "/{protection_id}/history",
    dependencies=[Depends(require_permission(Permission.PROTECTIONS_READ))],
)
async def get_protection_history(
    protection_id: str, service: ServiceDep
) -> list[Protection]:
    return await service.history(protection_id)


@router.put(
    "/{protection_id}",
    dependencies=[Depends(require_permission(Permission.PROTECTIONS_WRITE))],
)
async def update_protection(
    protection_id: str, body: UpdateProtection, service: ServiceDep, actor: ActorDep
) -> Protection:
    return await service.update(
        protection_id,
        ProtectionDefinition.model_validate(body.model_dump(exclude={"revision"})),
        actor,
        body.revision,
    )


@router.post(
    "/{protection_id}/retire",
    dependencies=[Depends(require_permission(Permission.PROTECTIONS_WRITE))],
)
async def retire_protection(
    protection_id: str, body: RetireProtection, service: ServiceDep, actor: ActorDep
) -> Protection:
    return await service.retire(
        protection_id,
        ProtectionRetirement(
            reason=body.reason, actor_id=actor, retired_at=datetime.now(UTC)
        ),
        body.revision,
    )
