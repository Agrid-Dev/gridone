from typing import Protocol

from models.pagination import Page, PaginationParams
from models.types import Severity
from notifications.models import Notification, NotificationForUser


class NotificationsServiceInterface(Protocol):
    async def dispatch(  # noqa: PLR0913
        self,
        title: str,
        body: str,
        severity: Severity,
        user_ids: list[str],
        correlation_id: str | None = None,
        created_by: str | None = None,
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
        notification_id: int,
        user_id: str,
    ) -> NotificationForUser: ...
