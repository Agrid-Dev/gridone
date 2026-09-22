import asyncpg

from models.errors import ConflictError
from users.roles import Role, RoleUpdate, known_permissions, known_scopes


class PostgresRolesStorage:
    """PostgreSQL-backed storage for custom roles: the ``roles`` table only.

    ``permissions`` and ``scopes`` are JSONB columns; the pool registers a
    jsonb codec so they round-trip as Python values. Members the vocabulary no
    longer knows are dropped on read (``known_permissions``, ``known_scopes``)
    rather than failing the row.
    """

    _pool: asyncpg.Pool

    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    def _row_to_model(self, row: asyncpg.Record) -> Role:
        permissions = known_permissions(row["permissions"], role_id=row["id"])
        return Role(
            id=row["id"],
            name=row["name"],
            description=row["description"],
            permissions=permissions,
            scopes=known_scopes(
                row["scopes"], permissions=permissions, role_id=row["id"]
            ),
        )

    async def get(self, role_id: str) -> Role | None:
        row = await self._pool.fetchrow("SELECT * FROM roles WHERE id = $1", role_id)
        return self._row_to_model(row) if row else None

    async def list_all(self) -> list[Role]:
        rows = await self._pool.fetch("SELECT * FROM roles ORDER BY id")
        return [self._row_to_model(r) for r in rows]

    async def insert(self, role: Role) -> None:
        document = role.model_dump(mode="json")
        try:
            await self._pool.execute(
                """
                INSERT INTO roles (id, name, description, permissions, scopes)
                VALUES ($1, $2, $3, $4, $5)
                """,
                role.id,
                role.name,
                role.description,
                document["permissions"],
                document["scopes"],
            )
        except asyncpg.UniqueViolationError as exc:
            msg = f"Role '{role.id}' already exists"
            raise ConflictError(msg) from exc

    async def update(self, role_id: str, update: RoleUpdate) -> Role | None:
        """Single UPDATE over the set columns only.

        Column names come from the DTO's field names, never from the caller,
        so interpolating them is safe. Values stay parameterised; JSON mode
        turns the permission enums into the strings the jsonb columns hold.
        """
        changes = update.model_dump(mode="json", exclude_none=True)
        if not changes:
            return await self.get(role_id)
        assignments = ", ".join(
            f"{column} = ${i}" for i, column in enumerate(changes, start=2)
        )
        row = await self._pool.fetchrow(
            f"UPDATE roles SET {assignments}, updated_at = now() "  # noqa: S608
            "WHERE id = $1 RETURNING *",
            role_id,
            *changes.values(),
        )
        return self._row_to_model(row) if row else None

    async def delete(self, role_id: str) -> None:
        await self._pool.execute("DELETE FROM roles WHERE id = $1", role_id)


__all__ = ["PostgresRolesStorage"]
