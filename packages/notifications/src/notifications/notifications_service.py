from datetime import UTC, datetime
from typing import TYPE_CHECKING

from models.errors import NotFoundError
from models.pagination import Page, PaginationParams
from models.types import Severity
from notifications.models import Notification, NotificationForUser
from notifications.storage.factory import build_notifications_storage

if TYPE_CHECKING:
    from notifications.storage.protocol import NotificationsStorageBackend


class NotificationsService:
    def __init__(self, storage_url: str) -> None:
        self._storage_url = storage_url

    async def start(self) -> None:
        self._storage: NotificationsStorageBackend = await build_notifications_storage(
            self._storage_url
        )

    async def close(self) -> None:
        await self._storage.close()

    async def dispatch(  # noqa: PLR0913
        self,
        title: str,
        body: str,
        severity: Severity,
        user_ids: list[str],
        correlation_id: str | None = None,
        created_by: str | None = None,
    ) -> Notification:
        active = (
            await self._storage.get_users_with_active_correlation(
                user_ids, correlation_id
            )
            if correlation_id is not None
            else set()
        )
        effective_user_ids = [uid for uid in user_ids if uid not in active]

        return await self._storage.insert(
            title=title,
            body=body,
            severity=severity,
            correlation_id=correlation_id,
            created_by=created_by,
            created_at=datetime.now(UTC),
            user_ids=effective_user_ids,
        )

    async def list(
        self,
        user_id: str,
        *,
        severity: Severity | None = None,
        dismissed: bool | None = None,
        pagination: PaginationParams | None = None,
    ) -> Page[NotificationForUser]:
        return await self._storage.list_for_user(
            user_id,
            severity=severity,
            dismissed=dismissed,
            pagination=pagination or PaginationParams(),
        )

    async def dismiss(
        self,
        notification_id: int,
        user_id: str,
    ) -> NotificationForUser:
        result = await self._storage.dismiss(notification_id, user_id)
        if result is None:
            msg = f"Notification '{notification_id}' not found for user '{user_id}'"
            raise NotFoundError(msg)
        return result
