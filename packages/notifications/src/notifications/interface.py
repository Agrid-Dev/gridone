from typing import Protocol

from models.pagination import Page, PaginationParams
from models.types import Severity
from notifications.models import NotificationDispatch


class NotificationsServiceInterface(Protocol):
    async def dispatch(  # noqa: PLR0913
        self,
        title: str,
        body: str,
        severity: Severity,
        user_ids: list[str],
        correlation_id: str | None = None,
        created_by: str | None = None,
    ) -> list[NotificationDispatch]: ...

    async def list_for_user(
        self,
        user_id: str,
        *,
        severity: Severity | None = None,
        dismissed: bool | None = None,
        pagination: PaginationParams | None = None,
    ) -> Page[NotificationDispatch]: ...

    async def dismiss(
        self,
        notification_id: str,
        user_id: str,
    ) -> NotificationDispatch: ...
