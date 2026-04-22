"""HTTP surface for dispatching commands to devices and managing the
templates those dispatches derive from.

Mounted inside ``devices_router`` so every route naturally lives under
``/devices``: single-device writes, batch dispatches, command history, and
the reusable (target, write) templates automations reference.
"""

from __future__ import annotations

from datetime import datetime  # noqa: TC003

from commands import AttributeWrite, CommandsServiceInterface, UnitCommand
from devices_manager import DevicesManagerInterface
from fastapi import APIRouter, Depends, HTTPException, Request, status
from models.pagination import Page, PaginationParams

from api.dependencies import (
    get_commands_service,
    get_current_user_id,
    get_device_manager,
    get_pagination_params,
    require_permission,
)
from api.permissions import Permission
from api.routes._command_helpers import (
    resolve_attribute_data_type,
    resolve_attribute_data_type_for_target,
    to_batch_dispatch_response,
)
from api.schemas.command import (
    BatchDeviceCommand,
    BatchDispatchResponse,
    CommandsQuery,
    SingleDeviceCommand,
    get_commands_query,
)
from api.schemas.command_template import (
    CommandTemplateCreatePayload,
    CommandTemplateResponse,
)
from api.schemas.pagination import PaginatedResponse, to_paginated_response

router = APIRouter()


def _resolve_start(query: CommandsQuery) -> datetime | None:
    """Resolve the ``last`` duration shorthand into a ``start`` timestamp."""
    if query.last is not None and query.start is None:
        from timeseries.domain import resolve_last  # noqa: PLC0415

        return resolve_last(query.last)
    return query.start


# ---------------------------------------------------------------------------
# Command history
# ---------------------------------------------------------------------------


@router.get(
    "/commands",
    dependencies=[Depends(require_permission(Permission.DEVICES_READ))],
)
async def list_commands(
    request: Request,
    query: CommandsQuery = Depends(get_commands_query),
    pagination: PaginationParams = Depends(get_pagination_params),
    commands_svc: CommandsServiceInterface = Depends(get_commands_service),
) -> PaginatedResponse[UnitCommand]:
    page = await commands_svc.get_commands(
        ids=query.ids,
        batch_id=query.batch_id,
        device_id=query.device_id,
        attribute=query.attribute,
        user_id=query.user_id,
        start=_resolve_start(query),
        end=query.end,
        sort=query.sort,
        pagination=pagination,
    )
    return to_paginated_response(page, str(request.url))


@router.get(
    "/{device_id}/commands",
    dependencies=[Depends(require_permission(Permission.DEVICES_READ))],
)
async def list_device_commands(
    device_id: str,
    request: Request,
    query: CommandsQuery = Depends(get_commands_query),
    pagination: PaginationParams = Depends(get_pagination_params),
    commands_svc: CommandsServiceInterface = Depends(get_commands_service),
) -> PaginatedResponse[UnitCommand]:
    # Path parameter always wins over a query-string device_id.
    page = await commands_svc.get_commands(
        ids=query.ids,
        batch_id=query.batch_id,
        device_id=device_id,
        attribute=query.attribute,
        user_id=query.user_id,
        start=_resolve_start(query),
        end=query.end,
        sort=query.sort,
        pagination=pagination,
    )
    return to_paginated_response(page, str(request.url))


# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------


@router.post(
    "/commands",
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(require_permission(Permission.DEVICES_WRITE))],
)
async def dispatch_batch_command(
    body: BatchDeviceCommand,
    dm: DevicesManagerInterface = Depends(get_device_manager),
    commands_svc: CommandsServiceInterface = Depends(get_commands_service),
    user_id: str = Depends(get_current_user_id),
) -> BatchDispatchResponse:
    target = body.target.model_dump(exclude_none=True)
    data_type = resolve_attribute_data_type_for_target(dm, target, body.attribute)
    commands = await commands_svc.dispatch_batch(
        target=target,
        write=AttributeWrite(
            attribute=body.attribute, value=body.value, data_type=data_type
        ),
        user_id=user_id,
        confirm=body.confirm,
    )
    if not commands:
        raise HTTPException(
            status_code=422,
            detail="Target resolved to no devices",
        )
    return to_batch_dispatch_response(commands)


@router.post(
    "/{device_id}/commands",
    dependencies=[Depends(require_permission(Permission.DEVICES_WRITE))],
)
async def dispatch_single_command(
    device_id: str,
    body: SingleDeviceCommand,
    dm: DevicesManagerInterface = Depends(get_device_manager),
    commands_svc: CommandsServiceInterface = Depends(get_commands_service),
    user_id: str = Depends(get_current_user_id),
) -> UnitCommand:
    dm.get_device(device_id)  # raises NotFoundError → 404 if unknown
    data_type = resolve_attribute_data_type(dm, [device_id], body.attribute)
    return await commands_svc.dispatch_unit(
        device_id=device_id,
        write=AttributeWrite(
            attribute=body.attribute, value=body.value, data_type=data_type
        ),
        user_id=user_id,
        confirm=body.confirm,
    )


# ---------------------------------------------------------------------------
# Command templates
# ---------------------------------------------------------------------------


@router.post(
    "/command-templates/",
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
    "/command-templates/",
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
    "/command-templates/{template_id}",
    dependencies=[Depends(require_permission(Permission.DEVICES_READ))],
)
async def get_template(
    template_id: str,
    commands_svc: CommandsServiceInterface = Depends(get_commands_service),
) -> CommandTemplateResponse:
    template = await commands_svc.get_template(template_id)
    return CommandTemplateResponse.from_domain(template)


@router.delete(
    "/command-templates/{template_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permission(Permission.DEVICES_WRITE))],
)
async def delete_template(
    template_id: str,
    commands_svc: CommandsServiceInterface = Depends(get_commands_service),
) -> None:
    await commands_svc.delete_template(template_id)


@router.post(
    "/command-templates/{template_id}/dispatch",
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
