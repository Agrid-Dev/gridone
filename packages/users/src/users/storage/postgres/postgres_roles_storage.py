import asyncpg

from models.errors import ConflictError
from users.roles import Role, RoleUpdate, known_permissions


class PostgresRolesStorage:
    """PostgreSQL-backed storage for custom roles: the ``roles`` table only.

    ``permissions`` is a JSONB column; the pool registers a jsonb codec so it
    round-trips as a Python list. Strings the vocabulary no longer knows are
    dropped on read (see ``known_permissions``) rather than failing the row.
    """

    _pool: asyncpg.Pool

    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    def _row_to_model(self, row: asyncpg.Record) -> Role:
        return Role(
            id=row["id"],
            name=row["name"],
            description=row["description"],
            permissions=known_permissions(row["permissions"], role_id=row["id"]),
        )

    async def get(self, role_id: str) -> Role | None:
        row = await self._pool.fetchrow("SELECT * FROM roles WHERE id = $1", role_id)
        return self._row_to_model(row) if row else None

    async def list_all(self) -> list[Role]:
        rows = await self._pool.fetch("SELECT * FROM roles ORDER BY id")
        return [self._row_to_model(r) for r in rows]

    async def insert(self, role: Role) -> None:
        try:
            await self._pool.execute(
                """
                INSERT INTO roles (id, name, description, permissions)
                VALUES ($1, $2, $3, $4)
                """,
                role.id,
                role.name,
                role.description,
                [str(p) for p in role.permissions],
            )
        except asyncpg.UniqueViolationError as exc:
            msg = f"Role '{role.id}' already exists"
            raise ConflictError(msg) from exc

    async def update(self, role_id: str, update: RoleUpdate) -> Role | None:
        """Single UPDATE over the set columns only.

        Column names come from the DTO's field names, never from the caller,
        so interpolating them is safe. Values stay parameterised.
        """
        changes = update.model_dump(exclude_none=True)
        if not changes:
            return await self.get(role_id)
        if "permissions" in changes:
            changes["permissions"] = [str(p) for p in changes["permissions"]]
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
