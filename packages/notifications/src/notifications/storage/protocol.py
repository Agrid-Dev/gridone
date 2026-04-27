from datetime import datetime
from typing import Protocol

from models.pagination import Page, PaginationParams
from models.types import Severity
from notifications.models import Notification, NotificationDispatch


class NotificationsStorageBackend(Protocol):
    async def upsert_notification(  # noqa: PLR0913
        self,
        title: str,
        body: str,
        severity: Severity,
        correlation_id: str | None,
        created_by: str | None,
        created_at: datetime,
    ) -> Notification: ...

    async def dispatch_to_users(
        self,
        notification: Notification,
        user_ids: list[str],
    ) -> list[NotificationDispatch]: ...

    async def list_for_user(
        self,
        user_id: str,
        *,
        severity: Severity | None,
        dismissed: bool | None,
        pagination: PaginationParams,
    ) -> Page[NotificationDispatch]: ...

    async def dismiss(
        self,
        notification_id: str,
        user_id: str,
    ) -> NotificationDispatch | None: ...

    async def close(self) -> None: ...
