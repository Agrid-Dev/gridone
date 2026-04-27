import asyncpg

from models.pagination import Page, PaginationParams
from models.types import Severity
from notifications.models import Notification, NotificationForUser


class PostgresNotificationsStorage:
    """PostgreSQL-backed storage for notifications."""

    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    def _row_to_model(self, row: asyncpg.Record) -> NotificationForUser:
        return NotificationForUser(
            id=row["id"],
            title=row["title"],
            body=row["body"],
            severity=Severity(row["severity"]),
            correlation_id=row["correlation_id"],
            created_at=row["created_at"],
            dismissed=row["dismissed"],
            dismissed_at=row["dismissed_at"],
        )

    async def insert(
        self,
        notification: Notification,
        recipient_ids: list[str],
    ) -> None:
        async with self._pool.acquire() as conn, conn.transaction():
            await conn.execute(
                """
                INSERT INTO notifications
                    (id, title, body, severity, correlation_id, created_at)
                VALUES ($1, $2, $3, $4, $5, $6)
                """,
                notification.id,
                notification.title,
                notification.body,
                notification.severity,
                notification.correlation_id,
                notification.created_at,
            )
            if recipient_ids:
                await conn.executemany(
                    """
                    INSERT INTO notification_recipients (notification_id, user_id)
                    VALUES ($1, $2)
                    """,
                    [(notification.id, uid) for uid in recipient_ids],
                )

    async def list_for_user(
        self,
        user_id: str,
        *,
        severity: Severity | None,
        dismissed: bool | None,
        pagination: PaginationParams,
    ) -> Page[NotificationForUser]:
        filters = ["nr.user_id = $1"]
        params: list[object] = [user_id]
        i = 2

        if severity is not None:
            filters.append(f"n.severity = ${i}")
            params.append(severity)
            i += 1
        if dismissed is not None:
            filters.append(f"nr.dismissed = ${i}")
            params.append(dismissed)
            i += 1

        where = " AND ".join(filters)
        base_query = f"""
            FROM notifications n
            JOIN notification_recipients nr ON nr.notification_id = n.id
            WHERE {where}
        """

        count_row = await self._pool.fetchrow(f"SELECT COUNT(*) {base_query}", *params)
        total: int = count_row["count"]

        rows = await self._pool.fetch(
            f"""
            SELECT n.id, n.title, n.body, n.severity, n.correlation_id, n.created_at,
                   nr.dismissed, nr.dismissed_at
            {base_query}
            ORDER BY n.created_at DESC
            LIMIT ${i} OFFSET ${i + 1}
            """,
            *params,
            pagination.limit,
            pagination.offset,
        )
        return Page(
            items=[self._row_to_model(r) for r in rows],
            total=total,
            page=pagination.page,
            size=pagination.size,
        )

    async def dismiss(
        self,
        notification_id: str,
        user_id: str,
    ) -> NotificationForUser | None:
        async with self._pool.acquire() as conn, conn.transaction():
            row = await conn.fetchrow(
                """
                SELECT n.id, n.title, n.body, n.severity, n.correlation_id,
                       n.created_at, nr.dismissed, nr.dismissed_at
                FROM notifications n
                JOIN notification_recipients nr ON nr.notification_id = n.id
                WHERE n.id = $1 AND nr.user_id = $2
                """,
                notification_id,
                user_id,
            )
            if row is None:
                return None
            if row["dismissed"]:
                return self._row_to_model(row)

            dismissed_row = await conn.fetchrow(
                """
                UPDATE notification_recipients
                SET dismissed = TRUE, dismissed_at = now()
                WHERE notification_id = $1 AND user_id = $2
                RETURNING dismissed_at
                """,
                notification_id,
                user_id,
            )
            return NotificationForUser(
                id=row["id"],
                title=row["title"],
                body=row["body"],
                severity=Severity(row["severity"]),
                correlation_id=row["correlation_id"],
                created_at=row["created_at"],
                dismissed=True,
                dismissed_at=dismissed_row["dismissed_at"],
            )

    async def get_recipients_with_active_correlation(
        self,
        user_ids: list[str],
        correlation_id: str,
    ) -> set[str]:
        if not user_ids:
            return set()
        rows = await self._pool.fetch(
            """
            SELECT DISTINCT nr.user_id
            FROM notifications n
            JOIN notification_recipients nr ON nr.notification_id = n.id
            WHERE n.correlation_id = $1
              AND nr.dismissed = FALSE
              AND nr.user_id = ANY($2)
            """,
            correlation_id,
            user_ids,
        )
        return {row["user_id"] for row in rows}

    async def close(self) -> None:
        await self._pool.close()
