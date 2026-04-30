from datetime import UTC, datetime

from models.errors import InvalidError
from models.ids import gen_id
from models.pagination import Page, PaginationParams
from models.types import Severity
from notifications.models import Notification, NotificationDispatch


class MemoryNotificationsStorage:
    """In-memory notifications storage backend."""

    def __init__(self) -> None:
        self._notifications: dict[str, Notification] = {}
        self._dispatches: list[NotificationDispatch] = []

    async def upsert_notification(  # noqa: PLR0913
        self,
        title: str,
        body: str,
        severity: Severity,
        correlation_id: str | None,
        created_by: str | None,
        created_at: datetime,
    ) -> Notification:
        if correlation_id is not None:
            existing = self._find_by_correlation_id(correlation_id)
            if existing is not None:
                if (
                    existing.title != title
                    or existing.body != body
                    or existing.severity != severity
                ):
                    msg = (
                        f"A notification with correlation_id {correlation_id!r} "
                        "already exists with different content."
                    )
                    raise InvalidError(msg)
                return existing

        notification = Notification(
            id=gen_id(),
            title=title,
            body=body,
            severity=severity,
            correlation_id=correlation_id,
            created_by=created_by,
            created_at=created_at,
        )
        self._notifications[notification.id] = notification
        return notification

    async def dispatch_to_users(
        self,
        notification: Notification,
        user_ids: list[str],
    ) -> list[NotificationDispatch]:
        new_dispatches: list[NotificationDispatch] = []
        now = datetime.now(UTC)
        for user_id in user_ids:
            if self._has_active_dispatch(notification.id, user_id):
                continue
            dispatch = NotificationDispatch(
                notification=notification,
                user_id=user_id,
                dispatched_at=now,
                dismissed_at=None,
            )
            self._dispatches.append(dispatch)
            new_dispatches.append(dispatch)
        return new_dispatches

    async def list_for_user(
        self,
        user_id: str,
        *,
        severity: Severity | None,
        dismissed: bool | None,
        pagination: PaginationParams,
    ) -> Page[NotificationDispatch]:
        matches = [
            d
            for d in self._dispatches
            if d.user_id == user_id
            and (severity is None or d.notification.severity == severity)
            and (
                dismissed is None
                or (dismissed is True and d.dismissed_at is not None)
                or (dismissed is False and d.dismissed_at is None)
            )
        ]
        matches.sort(key=lambda d: d.notification.created_at, reverse=True)
        total = len(matches)
        items = matches[pagination.offset : pagination.offset + pagination.limit]
        return Page(
            items=items, total=total, page=pagination.page, size=pagination.size
        )

    async def dismiss(
        self,
        notification_id: str,
        user_id: str,
    ) -> NotificationDispatch | None:
        active_index = self._find_dispatch_index(
            notification_id, user_id, dismissed=False
        )
        if active_index is not None:
            existing = self._dispatches[active_index]
            updated = NotificationDispatch(
                notification=existing.notification,
                user_id=existing.user_id,
                dispatched_at=existing.dispatched_at,
                dismissed_at=datetime.now(UTC),
            )
            self._dispatches[active_index] = updated
            return updated

        # No active dispatch — return the most recently dismissed one if any.
        epoch = datetime.min.replace(tzinfo=UTC)
        dismissed_matches = [
            d
            for d in self._dispatches
            if d.notification.id == notification_id
            and d.user_id == user_id
            and d.dismissed_at is not None
        ]
        if not dismissed_matches:
            return None
        return max(dismissed_matches, key=lambda d: d.dismissed_at or epoch)

    async def close(self) -> None:
        return None

    def _find_by_correlation_id(self, correlation_id: str) -> Notification | None:
        for notification in self._notifications.values():
            if notification.correlation_id == correlation_id:
                return notification
        return None

    def _has_active_dispatch(self, notification_id: str, user_id: str) -> bool:
        return (
            self._find_dispatch_index(notification_id, user_id, dismissed=False)
            is not None
        )

    def _find_dispatch_index(
        self, notification_id: str, user_id: str, *, dismissed: bool
    ) -> int | None:
        for i, d in enumerate(self._dispatches):
            if (
                d.notification.id == notification_id
                and d.user_id == user_id
                and (d.dismissed_at is not None) == dismissed
            ):
                return i
        return None
