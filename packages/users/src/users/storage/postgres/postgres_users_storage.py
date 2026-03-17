import asyncpg

from users.models import UserInDB


class PostgresUsersStorage:
    """PostgreSQL-backed storage for users."""

    _pool: asyncpg.Pool

    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    def _row_to_model(self, row: asyncpg.Record) -> UserInDB:
        return UserInDB(
            id=row["id"],
            username=row["username"],
            hashed_password=row["hashed_password"],
            role=row["role"],
            type=row["type"],
            name=row["name"],
            email=row["email"],
            title=row["title"],
            must_change_password=row["must_change_password"],
        )

    async def get_by_id(self, user_id: str) -> UserInDB | None:
        row = await self._pool.fetchrow("SELECT * FROM users WHERE id = $1", user_id)
        return self._row_to_model(row) if row else None

    async def get_by_username(self, username: str) -> UserInDB | None:
        row = await self._pool.fetchrow(
            "SELECT * FROM users WHERE username = $1", username
        )
        return self._row_to_model(row) if row else None

    async def list_all(self) -> list[UserInDB]:
        rows = await self._pool.fetch("SELECT * FROM users ORDER BY username")
        return [self._row_to_model(r) for r in rows]

    async def save(self, user: UserInDB) -> None:
        await self._pool.execute(
            """
            INSERT INTO users (
                id, username, hashed_password, role, type,
                name, email, title, must_change_password
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (id) DO UPDATE SET
                username = EXCLUDED.username,
                hashed_password = EXCLUDED.hashed_password,
                role = EXCLUDED.role,
                type = EXCLUDED.type,
                name = EXCLUDED.name,
                email = EXCLUDED.email,
                title = EXCLUDED.title,
                must_change_password = EXCLUDED.must_change_password
            """,
            user.id,
            user.username,
            user.hashed_password,
            user.role,
            user.type,
            user.name,
            user.email,
            user.title,
            user.must_change_password,
        )

    async def delete(self, user_id: str) -> None:
        await self._pool.execute("DELETE FROM users WHERE id = $1", user_id)

    async def close(self) -> None:
        await self._pool.close()
