from __future__ import annotations

from datetime import datetime  # noqa: TC003

from commands import Command, CommandsServiceInterface
from fastapi import APIRouter, Depends, Request
from models.pagination import PaginationParams

from api.dependencies import (
    get_commands_service,
    get_pagination_params,
    require_permission,
)
from api.permissions import Permission
from api.schemas.command import CommandsQuery, get_commands_query
from api.schemas.pagination import PaginatedResponse, to_paginated_response


def _resolve_start(query: CommandsQuery) -> datetime | None:
    """Resolve the ``last`` duration shorthand into a ``start`` timestamp."""
    if query.last is not None and query.start is None:
        from timeseries.domain import resolve_last  # noqa: PLC0415

        return resolve_last(query.last)
    return query.start


router = APIRouter()


@router.get("/", dependencies=[Depends(require_permission(Permission.DEVICES_READ))])
async def list_commands(
    request: Request,
    query: CommandsQuery = Depends(get_commands_query),
    pagination: PaginationParams = Depends(get_pagination_params),
    commands_svc: CommandsServiceInterface = Depends(get_commands_service),
) -> PaginatedResponse[Command]:
    page = await commands_svc.get_commands(
        ids=query.ids,
        group_id=query.group_id,
        device_id=query.device_id,
        attribute=query.attribute,
        user_id=query.user_id,
        start=_resolve_start(query),
        end=query.end,
        sort=query.sort,
        pagination=pagination,
    )
    return to_paginated_response(page, str(request.url))
