from typing import Protocol

from models.pagination import Page, PaginationParams
from models.types import Severity
from notifications.models import Notification, NotificationForUser


class NotificationsManagerInterface(Protocol):
    async def dispatch(
        self,
        title: str,
        body: str,
        severity: Severity,
        recipient_ids: list[str],
        correlation_id: str | None = None,
    ) -> Notification: ...

    async def list(
        self,
        user_id: str,
        *,
        severity: Severity | None = None,
        dismissed: bool | None = None,
        pagination: PaginationParams | None = None,
    ) -> Page[NotificationForUser]: ...

    async def dismiss(
        self,
        notification_id: str,
        user_id: str,
    ) -> NotificationForUser: ...
