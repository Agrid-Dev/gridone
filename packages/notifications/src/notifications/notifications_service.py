import logging
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from models.errors import NotFoundError
from models.pagination import Page, PaginationParams
from models.types import Severity
from notifications.models import Notification, NotificationDispatch
from notifications.storage.factory import build_notifications_storage

if TYPE_CHECKING:
    from notifications.storage.protocol import NotificationsStorageBackend

logger = logging.getLogger(__name__)


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
    ) -> list[NotificationDispatch]:
        notification = await self._upsert_notification(
            title=title,
            body=body,
            severity=severity,
            correlation_id=correlation_id,
            created_by=created_by,
        )
        dispatches = await self._storage.dispatch_to_users(notification, user_ids)

        skipped = len(user_ids) - len(dispatches)
        if correlation_id is not None and skipped > 0:
            logger.debug(
                "dispatch: correlation %r deduped %d/%d users",
                correlation_id,
                skipped,
                len(user_ids),
            )
        logger.info(
            "dispatch: notification=%s severity=%s dispatched=%d correlation=%r",
            notification.id,
            severity,
            len(dispatches),
            correlation_id,
        )
        return dispatches

    async def list_for_user(
        self,
        user_id: str,
        *,
        severity: Severity | None = None,
        dismissed: bool | None = None,
        pagination: PaginationParams | None = None,
    ) -> Page[NotificationDispatch]:
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
    ) -> NotificationDispatch:
        result = await self._storage.dismiss(notification_id, user_id)
        if result is None:
            msg = f"Notification '{notification_id}' not found for user '{user_id}'"
            raise NotFoundError(msg)
        logger.info("dismiss: notification=%s user=%s", notification_id, user_id)
        return result

    async def _upsert_notification(
        self,
        title: str,
        body: str,
        severity: Severity,
        correlation_id: str | None,
        created_by: str | None,
    ) -> Notification:
        return await self._storage.upsert_notification(
            title=title,
            body=body,
            severity=severity,
            correlation_id=correlation_id,
            created_by=created_by,
            created_at=datetime.now(UTC),
        )
