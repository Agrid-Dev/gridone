from datetime import UTC

import asyncpg

from apps.models import (
    RegistrationRequest,
    RegistrationRequestStatus,
)


class PostgresRegistrationRequestStorage:
    """PostgreSQL-backed storage for registration requests."""

    _pool: asyncpg.Pool

    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    def _row_to_model(self, row: asyncpg.Record) -> RegistrationRequest:
        created_at = row["created_at"]
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=UTC)
        return RegistrationRequest(
            id=row["id"],
            username=row["username"],
            hashed_password=row["hashed_password"],
            status=RegistrationRequestStatus(row["status"]),
            created_at=created_at,
            config=row["config"],
        )

    async def get_by_id(self, request_id: str) -> RegistrationRequest | None:
        row = await self._pool.fetchrow(
            "SELECT * FROM registration_requests WHERE id = $1", request_id
        )
        return self._row_to_model(row) if row else None

    async def list_all(self) -> list[RegistrationRequest]:
        rows = await self._pool.fetch(
            "SELECT * FROM registration_requests ORDER BY created_at DESC"
        )
        return [self._row_to_model(r) for r in rows]

    async def save(self, request: RegistrationRequest) -> None:
        created_at = request.created_at
        if created_at.tzinfo is not None:
            created_at = created_at.replace(tzinfo=None)
        await self._pool.execute(
            """
            INSERT INTO registration_requests (
                id, username, hashed_password, status, created_at, config
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (id) DO UPDATE SET
                username = EXCLUDED.username,
                hashed_password = EXCLUDED.hashed_password,
                status = EXCLUDED.status,
                created_at = EXCLUDED.created_at,
                config = EXCLUDED.config
            """,
            request.id,
            request.username,
            request.hashed_password,
            request.status,
            created_at,
            request.config,
        )

    async def close(self) -> None:
        await self._pool.close()
