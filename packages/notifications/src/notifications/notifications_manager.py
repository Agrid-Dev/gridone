from datetime import UTC, datetime
from typing import Self
from uuid import uuid4

from models.errors import NotFoundError
from models.pagination import Page, PaginationParams
from models.types import Severity
from notifications.models import Notification, NotificationForUser
from notifications.storage.factory import build_notifications_storage
from notifications.storage.protocol import NotificationsStorageBackend


class NotificationsManager:
    def __init__(self, storage: NotificationsStorageBackend) -> None:
        self._storage = storage

    async def close(self) -> None:
        await self._storage.close()

    @classmethod
    async def from_storage(cls, storage_url: str) -> Self:
        storage = await build_notifications_storage(storage_url)
        return cls(storage)

    async def dispatch(
        self,
        title: str,
        body: str,
        severity: Severity,
        recipient_ids: list[str],
        correlation_id: str | None = None,
    ) -> Notification:
        active = (
            await self._storage.get_recipients_with_active_correlation(
                recipient_ids, correlation_id
            )
            if correlation_id is not None
            else set()
        )
        effective_recipients = [uid for uid in recipient_ids if uid not in active]

        notification = Notification(
            id=uuid4().hex[:16],
            title=title,
            body=body,
            severity=severity,
            correlation_id=correlation_id,
            created_at=datetime.now(UTC),
        )
        await self._storage.insert(notification, effective_recipients)
        return notification

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
        notification_id: str,
        user_id: str,
    ) -> NotificationForUser:
        result = await self._storage.dismiss(notification_id, user_id)
        if result is None:
            msg = f"Notification '{notification_id}' not found for user '{user_id}'"
            raise NotFoundError(msg)
        return result
