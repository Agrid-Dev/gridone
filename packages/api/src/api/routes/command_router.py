"""HTTP surface for dispatching commands to devices and managing the
templates those dispatches derive from.

Mounted inside ``devices_router`` so every route naturally lives under
``/devices``: single-device writes, batch dispatches, command history, and
the reusable (target, write) templates automations reference.
"""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status

from api.auth import get_current_user_id, require_permission
from api.dependencies import (
    get_commands_service,
    get_device_manager,
    get_pagination_params,
    get_target_resolver,
)
from api.schemas.command import (
    BatchDeviceCommand,
    BatchDispatchResponse,
    CommandsQuery,
    DevicesFilterBody,
    SingleCommandPreview,
    SingleDeviceCommand,
    get_commands_query,
)
from api.schemas.command_template import (
    CommandTemplateCreatePayload,
    CommandTemplateResponse,
    CommandTemplateUpdatePayload,
)
from api.schemas.pagination import PaginatedResponse, to_paginated_response
from api.selection_commands import (
    SelectionCommandConfirm,
    SelectionCommandPrepare,
    SelectionCommandPreview,
    SelectionCommands,
)
from api.targets import validate_targets
from commands import (
    AttributeWrite,
    CommandsServiceInterface,
    UnitCommand,
)
from devices_manager import DevicesServiceInterface
from models.errors import InvalidError
from models.pagination import Page, PaginationParams
from models.resource_conflict import ResourceConflictCode, ResourceConflictError
from models.targets import (
    AttributeTarget,
    DevicesFilter,
    ResolvedTarget,
    TargetResolver,
)
from models.types import DataType
from users.permissions import Permission

router = APIRouter()


async def _validated_write_target(
    resolver: TargetResolver,
    *,
    devices: DevicesFilter,
    attribute: str,
    expected_data_type: DataType | None = None,
) -> ResolvedTarget:
    """Resolve a command target for a write, enforcing the save-time gate.

    Raises ``InvalidError`` (→ 422) when no matched device exposes the
    attribute as writable, when the resolved data types are mixed, or when
    *expected_data_type* (a client-supplied ``write.data_type``) disagrees
    with the resolved one.
    """
    attr_target = AttributeTarget(devices=devices, attribute=attribute)
    resolved = (await validate_targets(resolver, [attr_target], writable=True))[0]
    if expected_data_type is not None and resolved.data_type != expected_data_type:
        msg = (
            f"write.data_type '{expected_data_type}' does not match the "
            f"resolved data type '{resolved.data_type}' for '{attribute}'"
        )
        raise InvalidError(msg)
    return resolved


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
        template_id=query.template_id,
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
        template_id=query.template_id,
        device_id=device_id,
        attribute=query.attribute,
        user_id=query.user_id,
        start=_resolve_start(query),
        end=query.end,
        sort=query.sort,
        pagination=pagination,
    )
    return to_paginated_response(page, str(request.url))


def get_selection_commands(request: Request) -> SelectionCommands:
    return request.app.state.selection_commands


@router.post(
    "/commands/preview",
    dependencies=[Depends(require_permission(Permission.DEVICES_COMMAND))],
)
async def preview_selection_command(
    body: SelectionCommandPrepare,
    coordinator: SelectionCommands = Depends(get_selection_commands),
    user_id: str = Depends(get_current_user_id),
) -> SelectionCommandPreview:
    return coordinator.prepare(body, user_id)


@router.post(
    "/commands/confirm",
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(require_permission(Permission.DEVICES_COMMAND))],
)
async def confirm_selection_command(
    body: SelectionCommandConfirm,
    coordinator: SelectionCommands = Depends(get_selection_commands),
    user_id: str = Depends(get_current_user_id),
) -> BatchDispatchResponse:
    return await coordinator.confirm(body, user_id)


# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------


@router.post(
    "/commands",
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(require_permission(Permission.DEVICES_COMMAND))],
)
async def dispatch_batch_command(
    body: BatchDeviceCommand,
    resolver: TargetResolver = Depends(get_target_resolver),
    commands_svc: CommandsServiceInterface = Depends(get_commands_service),
    user_id: str = Depends(get_current_user_id),
) -> BatchDispatchResponse:
    target = body.target.to_devices_filter()
    if bool(target.tags):
        raise ResourceConflictError(ResourceConflictCode.COMMAND_PREVIEW_REQUIRED, [])
    resolved = await _validated_write_target(
        resolver, devices=target, attribute=body.attribute
    )
    dispatch = await commands_svc.dispatch_batch(
        target=target,
        write=AttributeWrite(
            attribute=body.attribute, value=body.value, data_type=resolved.data_type
        ),
        user_id=user_id,
        confirm=body.confirm,
    )
    if not dispatch.commands:
        raise HTTPException(
            status_code=422,
            detail="Target resolved to no devices",
        )
    return BatchDispatchResponse(batch_id=dispatch.batch_id, commands=dispatch.commands)


@router.post(
    "/{device_id}/commands/preview",
    dependencies=[Depends(require_permission(Permission.DEVICES_COMMAND))],
)
async def preview_single_command(
    device_id: str,
    body: SingleDeviceCommand,
    dm: DevicesServiceInterface = Depends(get_device_manager),
    coordinator: SelectionCommands = Depends(get_selection_commands),
    user_id: str = Depends(get_current_user_id),
) -> SingleCommandPreview:
    """Prepare optional UI consent while retaining synchronous unit-write outcomes.

    A one-device selection reuses the same bound, expiring preview contract as
    grouped commands. Its token is consumed by the synchronous unit dispatch:
    live controls await the write/read-back outcome rather than polling a batch.
    """
    # The preview reads and expires loop-owned device state: it must run on the
    # event loop like every other route, never in a worker thread.
    preview = dm.preview_device_write(device_id, body.attribute, body.value)
    token = None
    if preview.eligible and preview.user_confirmation is not None:
        prepared = coordinator.prepare(
            SelectionCommandPrepare(
                target=DevicesFilterBody(ids=[device_id]),
                attribute=body.attribute,
                value=body.value,
            ),
            user_id,
        )
        preview = prepared.members[0]
        token = prepared.token
    return SingleCommandPreview(**preview.model_dump(), confirmation_token=token)


@router.post(
    "/{device_id}/commands",
    dependencies=[Depends(require_permission(Permission.DEVICES_COMMAND))],
)
async def dispatch_single_command(
    device_id: str,
    body: SingleDeviceCommand,
    dm: DevicesServiceInterface = Depends(get_device_manager),
    resolver: TargetResolver = Depends(get_target_resolver),
    commands_svc: CommandsServiceInterface = Depends(get_commands_service),
    user_id: str = Depends(get_current_user_id),
    coordinator: SelectionCommands = Depends(get_selection_commands),
) -> UnitCommand:
    dm.get_device(device_id)  # raises NotFoundError → 404 if unknown
    resolved = await resolver.resolve(
        AttributeTarget(
            devices=DevicesFilter(ids=[device_id]), attribute=body.attribute
        ),
        writable=False,
    )
    context = None
    if body.ui_confirmation_token is not None:
        context = coordinator.consume_unit_confirmation(
            body.ui_confirmation_token,
            user_id,
            device_id,
            body.attribute,
            body.value,
            body.confirmation_language or "en",
        )
    return await commands_svc.dispatch_unit(
        device_id=device_id,
        write=AttributeWrite(
            attribute=body.attribute, value=body.value, data_type=resolved.data_type
        ),
        user_id=user_id,
        confirm=body.confirm,
        ui_confirmation=context,
    )


# ---------------------------------------------------------------------------
# Command templates
# ---------------------------------------------------------------------------


@router.post(
    "/commands/templates/",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission(Permission.DEVICES_COMMAND))],
)
async def create_template(
    body: CommandTemplateCreatePayload,
    resolver: TargetResolver = Depends(get_target_resolver),
    commands_svc: CommandsServiceInterface = Depends(get_commands_service),
    user_id: str = Depends(get_current_user_id),
) -> CommandTemplateResponse:
    await _validated_write_target(
        resolver,
        devices=body.target.to_devices_filter(),
        attribute=body.write.attribute,
        expected_data_type=body.write.data_type,
    )
    template = await commands_svc.save_template(body.to_domain(), user_id)
    return CommandTemplateResponse.from_domain(template)


@router.get(
    "/commands/templates/",
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
    "/commands/templates/{template_id}",
    dependencies=[Depends(require_permission(Permission.DEVICES_READ))],
)
async def get_template(
    template_id: str,
    commands_svc: CommandsServiceInterface = Depends(get_commands_service),
) -> CommandTemplateResponse:
    template = await commands_svc.get_template(template_id)
    return CommandTemplateResponse.from_domain(template)


@router.patch(
    "/commands/templates/{template_id}",
    dependencies=[Depends(require_permission(Permission.DEVICES_COMMAND))],
)
async def update_template(
    template_id: str,
    body: CommandTemplateUpdatePayload,
    resolver: TargetResolver = Depends(get_target_resolver),
    commands_svc: CommandsServiceInterface = Depends(get_commands_service),
) -> CommandTemplateResponse:
    patch = body.to_domain()
    if patch.target is not None or patch.write is not None:
        # Validate the template as it will exist after the patch: unchanged
        # fields come from the stored version. Name-only patches skip
        # validation so a template with a stale target can still be renamed.
        existing = await commands_svc.get_template(template_id)
        merged_target = patch.target if patch.target is not None else existing.target
        merged_write = patch.write if patch.write is not None else existing.write
        await _validated_write_target(
            resolver,
            devices=merged_target,
            attribute=merged_write.attribute,
            expected_data_type=merged_write.data_type,
        )
    template = await commands_svc.update_template(template_id, patch)
    return CommandTemplateResponse.from_domain(template)


@router.delete(
    "/commands/templates/{template_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permission(Permission.DEVICES_COMMAND))],
)
async def delete_template(
    template_id: str,
    commands_svc: CommandsServiceInterface = Depends(get_commands_service),
) -> None:
    await commands_svc.delete_template(template_id)


@router.post(
    "/commands/templates/{template_id}/dispatch",
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(require_permission(Permission.DEVICES_COMMAND))],
)
async def dispatch_template(
    template_id: str,
    commands_svc: CommandsServiceInterface = Depends(get_commands_service),
    user_id: str = Depends(get_current_user_id),
) -> BatchDispatchResponse:
    template = await commands_svc.get_template(template_id)
    if bool(template.target.tags):
        raise ResourceConflictError(ResourceConflictCode.COMMAND_PREVIEW_REQUIRED, [])
    dispatch = await commands_svc.dispatch_template(template=template, user_id=user_id)
    if not dispatch.commands:
        raise HTTPException(
            status_code=422,
            detail="Target resolved to no devices",
        )
    return BatchDispatchResponse(batch_id=dispatch.batch_id, commands=dispatch.commands)
