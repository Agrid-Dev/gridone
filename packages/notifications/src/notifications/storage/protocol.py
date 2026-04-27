from typing import Protocol

from models.pagination import Page, PaginationParams
from models.types import Severity
from notifications.models import Notification, NotificationForUser


class NotificationsStorageBackend(Protocol):
    async def insert(
        self,
        notification: Notification,
        recipient_ids: list[str],
    ) -> None: ...

    async def list_for_user(
        self,
        user_id: str,
        *,
        severity: Severity | None,
        dismissed: bool | None,
        pagination: PaginationParams,
    ) -> Page[NotificationForUser]: ...

    async def dismiss(
        self,
        notification_id: str,
        user_id: str,
    ) -> NotificationForUser | None: ...

    async def get_recipients_with_active_correlation(
        self,
        user_ids: list[str],
        correlation_id: str,
    ) -> set[str]: ...

    async def close(self) -> None: ...
