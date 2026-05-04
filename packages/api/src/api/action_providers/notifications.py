from __future__ import annotations

from typing import TYPE_CHECKING, ClassVar

from automations.constants import SYSTEM_ACTOR
from models.types import Severity
from pydantic import BaseModel, Field

if TYPE_CHECKING:
    from notifications.interface import NotificationsServiceInterface


class NotificationAction(BaseModel):
    title: str
    body: str
    severity: Severity
    user_ids: list[str] = Field(min_length=1)


class NotificationsActionProvider:
    id = "notification"
    params_schema: ClassVar[dict] = NotificationAction.model_json_schema()

    def __init__(self, notifications_service: NotificationsServiceInterface) -> None:
        self._notifications_service = notifications_service

    async def execute(self, params: dict) -> str | None:
        action = NotificationAction(**params)
        dispatches = await self._notifications_service.dispatch(
            title=action.title,
            body=action.body,
            severity=action.severity,
            user_ids=action.user_ids,
            created_by=SYSTEM_ACTOR,
        )
        return dispatches[0].notification.id if dispatches else None
