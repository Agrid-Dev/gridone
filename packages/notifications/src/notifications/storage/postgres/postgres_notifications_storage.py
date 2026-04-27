from datetime import datetime
from uuid import uuid4

import asyncpg

from models.errors import InvalidError
from models.pagination import Page, PaginationParams
from models.types import Severity
from notifications.models import Notification, NotificationDispatch


class PostgresNotificationsStorage:
    """PostgreSQL-backed storage for notifications."""

    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    def _row_to_notification(self, row: asyncpg.Record) -> Notification:
        return Notification(
            id=row["id"],
            title=row["title"],
            body=row["body"],
            severity=Severity(row["severity"]),
            correlation_id=row["correlation_id"],
            created_by=row["created_by"],
            created_at=row["created_at"],
        )

    def _row_to_dispatch(
        self, row: asyncpg.Record, notification: Notification
    ) -> NotificationDispatch:
        return NotificationDispatch(
            notification=notification,
            user_id=row["user_id"],
            dispatched_at=row["dispatched_at"],
            dismissed_at=row["dismissed_at"],
        )

    async def upsert_notification(  # noqa: PLR0913
        self,
        title: str,
        body: str,
        severity: Severity,
        correlation_id: str | None,
        created_by: str | None,
        created_at: datetime,
    ) -> Notification:
        notification_id = uuid4().hex[:16]

        if correlation_id is None:
            row = await self._pool.fetchrow(
                """
                INSERT INTO notifications
                    (id, title, body, severity, created_by, created_at)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING
                    id, title, body, severity, correlation_id, created_by, created_at
                """,
                notification_id,
                title,
                body,
                severity,
                created_by,
                created_at,
            )
            return self._row_to_notification(row)

        row = await self._pool.fetchrow(
            """
            INSERT INTO notifications
                (id, title, body, severity, correlation_id, created_by, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (correlation_id) DO NOTHING
            RETURNING id, title, body, severity, correlation_id, created_by, created_at
            """,
            notification_id,
            title,
            body,
            severity,
            correlation_id,
            created_by,
            created_at,
        )
        if row is not None:
            return self._row_to_notification(row)

        existing = await self._pool.fetchrow(
            """
            SELECT id, title, body, severity, correlation_id, created_by, created_at
            FROM notifications
            WHERE correlation_id = $1
            """,
            correlation_id,
        )
        if (
            existing["title"] != title
            or existing["body"] != body
            or existing["severity"] != severity
        ):
            msg = (
                f"A notification with correlation_id {correlation_id!r} already exists "
                "with different content."
            )
            raise InvalidError(msg)
        return self._row_to_notification(existing)

    async def dispatch_to_users(
        self,
        notification: Notification,
        user_ids: list[str],
    ) -> list[NotificationDispatch]:
        if not user_ids:
            return []

        rows = await self._pool.fetch(
            """
            INSERT INTO notification_dispatches (notification_id, user_id)
            SELECT $1, uid
            FROM unnest($2::text[]) AS uid
            WHERE NOT EXISTS (
                SELECT 1 FROM notification_dispatches
                WHERE notification_id = $1 AND user_id = uid AND dismissed_at IS NULL
            )
            RETURNING user_id, dispatched_at, dismissed_at
            """,
            notification.id,
            user_ids,
        )
        return [self._row_to_dispatch(r, notification) for r in rows]

    async def list_for_user(
        self,
        user_id: str,
        *,
        severity: Severity | None,
        dismissed: bool | None,
        pagination: PaginationParams,
    ) -> Page[NotificationDispatch]:
        filters = ["nd.user_id = $1"]
        params: list[object] = [user_id]
        i = 2

        if severity is not None:
            filters.append(f"n.severity = ${i}")
            params.append(severity)
            i += 1
        if dismissed is True:
            filters.append("nd.dismissed_at IS NOT NULL")
        elif dismissed is False:
            filters.append("nd.dismissed_at IS NULL")

        where = " AND ".join(filters)
        base_query = f"""
            FROM notifications n
            JOIN notification_dispatches nd ON nd.notification_id = n.id
            WHERE {where}
        """

        count_row = await self._pool.fetchrow(f"SELECT COUNT(*) {base_query}", *params)
        total: int = count_row["count"]

        rows = await self._pool.fetch(
            f"""
            SELECT n.id, n.title, n.body, n.severity, n.correlation_id,
                   n.created_by, n.created_at,
                   nd.user_id, nd.dispatched_at, nd.dismissed_at
            {base_query}
            ORDER BY n.created_at DESC
            LIMIT ${i} OFFSET ${i + 1}
            """,
            *params,
            pagination.limit,
            pagination.offset,
        )
        items = [self._row_to_dispatch(r, self._row_to_notification(r)) for r in rows]
        return Page(
            items=items, total=total, page=pagination.page, size=pagination.size
        )

    async def dismiss(
        self,
        notification_id: str,
        user_id: str,
    ) -> NotificationDispatch | None:
        async with self._pool.acquire() as conn, conn.transaction():
            notification_row = await conn.fetchrow(
                """
                SELECT n.id, n.title, n.body, n.severity, n.correlation_id,
                       n.created_by, n.created_at
                FROM notifications n
                JOIN notification_dispatches nd ON nd.notification_id = n.id
                WHERE n.id = $1 AND nd.user_id = $2
                """,
                notification_id,
                user_id,
            )
            if notification_row is None:
                return None

            notification = self._row_to_notification(notification_row)

            dispatch_row = await conn.fetchrow(
                """
                SELECT user_id, dispatched_at, dismissed_at
                FROM notification_dispatches
                WHERE notification_id = $1 AND user_id = $2
                """,
                notification_id,
                user_id,
            )
            if dispatch_row["dismissed_at"] is not None:
                return self._row_to_dispatch(dispatch_row, notification)

            updated_row = await conn.fetchrow(
                """
                UPDATE notification_dispatches
                SET dismissed_at = now()
                WHERE notification_id = $1 AND user_id = $2
                RETURNING user_id, dispatched_at, dismissed_at
                """,
                notification_id,
                user_id,
            )
            return self._row_to_dispatch(updated_row, notification)

    async def close(self) -> None:
        await self._pool.close()
