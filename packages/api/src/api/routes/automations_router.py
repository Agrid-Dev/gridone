from __future__ import annotations

from typing import Annotated

from automations import (
    Automation,
    AutomationCreate,
    AutomationExecution,
    AutomationUpdate,
    AutomationsServiceInterface,
)
from fastapi import APIRouter, Depends, Query, status

from api.dependencies import get_automations_service, require_permission
from api.permissions import Permission

router = APIRouter()


@router.get(
    "/triggers",
    dependencies=[Depends(require_permission(Permission.AUTOMATIONS_READ))],
)
async def list_trigger_schemas(
    svc: Annotated[AutomationsServiceInterface, Depends(get_automations_service)],
) -> list[dict]:
    return list(svc.list_trigger_schemas())


@router.get(
    "/",
    response_model=list[Automation],
    dependencies=[Depends(require_permission(Permission.AUTOMATIONS_READ))],
)
async def list_automations(
    svc: Annotated[AutomationsServiceInterface, Depends(get_automations_service)],
    enabled: bool | None = Query(None),
) -> list[Automation]:
    return list(await svc.list(enabled=enabled))


@router.post(
    "/",
    response_model=Automation,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission(Permission.AUTOMATIONS_WRITE))],
)
async def create_automation(
    body: AutomationCreate,
    svc: Annotated[AutomationsServiceInterface, Depends(get_automations_service)],
) -> Automation:
    return await svc.create(body)


@router.get(
    "/{automation_id}",
    response_model=Automation,
    dependencies=[Depends(require_permission(Permission.AUTOMATIONS_READ))],
)
async def get_automation(
    automation_id: str,
    svc: Annotated[AutomationsServiceInterface, Depends(get_automations_service)],
) -> Automation:
    return await svc.get(automation_id)


@router.patch(
    "/{automation_id}",
    response_model=Automation,
    dependencies=[Depends(require_permission(Permission.AUTOMATIONS_WRITE))],
)
async def update_automation(
    automation_id: str,
    body: AutomationUpdate,
    svc: Annotated[AutomationsServiceInterface, Depends(get_automations_service)],
) -> Automation:
    return await svc.update(automation_id, body)


@router.delete(
    "/{automation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permission(Permission.AUTOMATIONS_WRITE))],
)
async def delete_automation(
    automation_id: str,
    svc: Annotated[AutomationsServiceInterface, Depends(get_automations_service)],
) -> None:
    await svc.delete(automation_id)


@router.post(
    "/{automation_id}/enable",
    response_model=Automation,
    dependencies=[Depends(require_permission(Permission.AUTOMATIONS_WRITE))],
)
async def enable_automation(
    automation_id: str,
    svc: Annotated[AutomationsServiceInterface, Depends(get_automations_service)],
) -> Automation:
    return await svc.enable(automation_id)


@router.post(
    "/{automation_id}/disable",
    response_model=Automation,
    dependencies=[Depends(require_permission(Permission.AUTOMATIONS_WRITE))],
)
async def disable_automation(
    automation_id: str,
    svc: Annotated[AutomationsServiceInterface, Depends(get_automations_service)],
) -> Automation:
    return await svc.disable(automation_id)


@router.get(
    "/{automation_id}/executions",
    response_model=list[AutomationExecution],
    dependencies=[Depends(require_permission(Permission.AUTOMATIONS_READ))],
)
async def list_executions(
    automation_id: str,
    svc: Annotated[AutomationsServiceInterface, Depends(get_automations_service)],
) -> list[AutomationExecution]:
    return list(await svc.list_executions(automation_id))
