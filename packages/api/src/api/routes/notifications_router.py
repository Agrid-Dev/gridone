from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, status
from pydantic import BaseModel, Field

from api.dependencies import (
    get_current_user_id,
    get_notifications_service,
    get_pagination_params,
    require_permission,
)
from api.permissions import Permission
from api.schemas.pagination import PaginatedResponse, to_paginated_response
from models.pagination import PaginationParams
from models.types import Severity
from notifications import NotificationDispatch, NotificationsServiceInterface

router = APIRouter()


class DispatchNotificationRequest(BaseModel):
    title: str
    body: str
    severity: Severity
    user_ids: list[str] = Field(min_length=1)
    correlation_id: str | None = None


@router.get("/")
async def list_notifications(
    request: Request,
    user_id: Annotated[str, Depends(get_current_user_id)],
    svc: Annotated[NotificationsServiceInterface, Depends(get_notifications_service)],
    pagination: Annotated[PaginationParams, Depends(get_pagination_params)],
    severity: Severity | None = Query(None),
    *,
    dismissed: bool | None = Query(None),
) -> PaginatedResponse[NotificationDispatch]:
    page = await svc.list_for_user(
        user_id,
        severity=severity,
        dismissed=dismissed,
        pagination=pagination,
    )
    return to_paginated_response(page, str(request.url))


@router.post("/{notification_id}/dismiss")
async def dismiss_notification(
    notification_id: str,
    user_id: Annotated[str, Depends(get_current_user_id)],
    svc: Annotated[NotificationsServiceInterface, Depends(get_notifications_service)],
) -> NotificationDispatch:
    return await svc.dismiss(notification_id, user_id)


@router.post(
    "/",
    status_code=status.HTTP_201_CREATED,
)
async def dispatch_notification(
    body: DispatchNotificationRequest,
    created_by: Annotated[
        str, Depends(require_permission(Permission.NOTIFICATIONS_WRITE))
    ],
    svc: Annotated[NotificationsServiceInterface, Depends(get_notifications_service)],
) -> list[NotificationDispatch]:
    return await svc.dispatch(
        title=body.title,
        body=body.body,
        severity=body.severity,
        user_ids=body.user_ids,
        correlation_id=body.correlation_id,
        created_by=created_by,
    )
