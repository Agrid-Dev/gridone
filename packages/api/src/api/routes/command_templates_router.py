"""HTTP surface for command templates — the reusable ``target + payload``
description that automations dispatch from."""

from __future__ import annotations

from commands import CommandsServiceInterface
from fastapi import APIRouter, Depends, HTTPException, Request, status
from models.pagination import Page, PaginationParams

from api.dependencies import (
    get_commands_service,
    get_current_user_id,
    get_pagination_params,
    require_permission,
)
from api.permissions import Permission
from api.routes._command_helpers import to_batch_dispatch_response
from api.schemas.command import BatchDispatchResponse
from api.schemas.command_template import (
    CommandTemplateCreatePayload,
    CommandTemplateResponse,
)
from api.schemas.pagination import PaginatedResponse, to_paginated_response

router = APIRouter()


@router.post(
    "/",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission(Permission.DEVICES_WRITE))],
)
async def create_template(
    body: CommandTemplateCreatePayload,
    commands_svc: CommandsServiceInterface = Depends(get_commands_service),
    user_id: str = Depends(get_current_user_id),
) -> CommandTemplateResponse:
    template = await commands_svc.save_template(body.to_domain(), user_id)
    return CommandTemplateResponse.from_domain(template)


@router.get(
    "/",
    dependencies=[Depends(require_permission(Permission.DEVICES_READ))],
)
async def list_templates(
    request: Request,
    pagination: PaginationParams = Depends(get_pagination_params),
    commands_svc: CommandsServiceInterface = Depends(get_commands_service),
) -> PaginatedResponse[CommandTemplateResponse]:
    page = await commands_svc.list_templates(pagination=pagination)
    mapped: Page[CommandTemplateResponse] = Page(
        items=[CommandTemplateResponse.from_domain(t) for t in page.items],
        total=page.total,
        page=page.page,
        size=page.size,
    )
    return to_paginated_response(mapped, str(request.url))


@router.get(
    "/{template_id}",
    dependencies=[Depends(require_permission(Permission.DEVICES_READ))],
)
async def get_template(
    template_id: str,
    commands_svc: CommandsServiceInterface = Depends(get_commands_service),
) -> CommandTemplateResponse:
    template = await commands_svc.get_template(template_id)
    return CommandTemplateResponse.from_domain(template)


@router.delete(
    "/{template_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permission(Permission.DEVICES_WRITE))],
)
async def delete_template(
    template_id: str,
    commands_svc: CommandsServiceInterface = Depends(get_commands_service),
) -> None:
    await commands_svc.delete_template(template_id)


@router.post(
    "/{template_id}/dispatch",
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(require_permission(Permission.DEVICES_WRITE))],
)
async def dispatch_template(
    template_id: str,
    commands_svc: CommandsServiceInterface = Depends(get_commands_service),
    user_id: str = Depends(get_current_user_id),
) -> BatchDispatchResponse:
    commands = await commands_svc.dispatch_from_template(
        template_id=template_id, user_id=user_id
    )
    if not commands:
        raise HTTPException(
            status_code=422,
            detail="Target resolved to no devices",
        )
    return to_batch_dispatch_response(commands)
