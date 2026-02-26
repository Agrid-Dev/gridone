import asyncpg

from users.authorization_models import Permission, Role, UserRoleAssignment


class PostgresAuthorizationStorage:
    """PostgreSQL-backed storage for roles and user role assignments."""

    _pool: asyncpg.Pool

    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    async def ensure_schema(self) -> None:
        await self._pool.execute(
            """
            CREATE TABLE IF NOT EXISTS roles (
                id          TEXT PRIMARY KEY,
                name        TEXT UNIQUE NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                is_system   BOOLEAN NOT NULL DEFAULT FALSE
            )
            """
        )
        await self._pool.execute(
            """
            CREATE TABLE IF NOT EXISTS role_permissions (
                role_id     TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
                permission  TEXT NOT NULL,
                PRIMARY KEY (role_id, permission)
            )
            """
        )
        await self._pool.execute(
            """
            CREATE TABLE IF NOT EXISTS user_role_assignments (
                id          TEXT PRIMARY KEY,
                user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                role_id     TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
                asset_id    TEXT
            )
            """
        )
        # Unique constraint handling NULL asset_id
        await self._pool.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS idx_ura_unique
                ON user_role_assignments (user_id, role_id, COALESCE(asset_id, '__GLOBAL__'))
            """
        )
        await self._pool.execute(
            "CREATE INDEX IF NOT EXISTS idx_ura_user_id ON user_role_assignments(user_id)"
        )
        await self._pool.execute(
            "CREATE INDEX IF NOT EXISTS idx_ura_role_id ON user_role_assignments(role_id)"
        )

    # ── Roles ─────────────────────────────────────────────────────────

    async def _fetch_permissions(self, role_id: str) -> list[Permission]:
        rows = await self._pool.fetch(
            "SELECT permission FROM role_permissions WHERE role_id = $1 ORDER BY permission",
            role_id,
        )
        result = []
        for r in rows:
            try:
                result.append(Permission(r["permission"]))
            except ValueError:
                pass  # skip unknown permissions (forward-compat)
        return result

    async def get_role_by_id(self, role_id: str) -> Role | None:
        row = await self._pool.fetchrow("SELECT * FROM roles WHERE id = $1", role_id)
        if row is None:
            return None
        perms = await self._fetch_permissions(role_id)
        return Role(
            id=row["id"],
            name=row["name"],
            description=row["description"],
            is_system=row["is_system"],
            permissions=perms,
        )

    async def get_role_by_name(self, name: str) -> Role | None:
        row = await self._pool.fetchrow("SELECT * FROM roles WHERE name = $1", name)
        if row is None:
            return None
        perms = await self._fetch_permissions(row["id"])
        return Role(
            id=row["id"],
            name=row["name"],
            description=row["description"],
            is_system=row["is_system"],
            permissions=perms,
        )

    async def list_roles(self) -> list[Role]:
        rows = await self._pool.fetch("SELECT * FROM roles ORDER BY name")
        roles = []
        for row in rows:
            perms = await self._fetch_permissions(row["id"])
            roles.append(
                Role(
                    id=row["id"],
                    name=row["name"],
                    description=row["description"],
                    is_system=row["is_system"],
                    permissions=perms,
                )
            )
        return roles

    async def save_role(self, role: Role) -> None:
        async with self._pool.acquire() as conn:
            async with conn.transaction():
                await conn.execute(
                    """
                    INSERT INTO roles (id, name, description, is_system)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT (id) DO UPDATE SET
                        name = EXCLUDED.name,
                        description = EXCLUDED.description,
                        is_system = EXCLUDED.is_system
                    """,
                    role.id,
                    role.name,
                    role.description,
                    role.is_system,
                )
                await conn.execute(
                    "DELETE FROM role_permissions WHERE role_id = $1", role.id
                )
                if role.permissions:
                    await conn.executemany(
                        "INSERT INTO role_permissions (role_id, permission) VALUES ($1, $2)",
                        [(role.id, str(p)) for p in role.permissions],
                    )

    async def delete_role(self, role_id: str) -> None:
        await self._pool.execute("DELETE FROM roles WHERE id = $1", role_id)

    # ── User role assignments ─────────────────────────────────────────

    def _row_to_assignment(self, row: asyncpg.Record) -> UserRoleAssignment:
        return UserRoleAssignment(
            id=row["id"],
            user_id=row["user_id"],
            role_id=row["role_id"],
            asset_id=row["asset_id"],
        )

    async def get_assignment_by_id(
        self, assignment_id: str
    ) -> UserRoleAssignment | None:
        row = await self._pool.fetchrow(
            "SELECT * FROM user_role_assignments WHERE id = $1", assignment_id
        )
        return self._row_to_assignment(row) if row else None

    async def list_assignments_for_user(
        self, user_id: str
    ) -> list[UserRoleAssignment]:
        rows = await self._pool.fetch(
            "SELECT * FROM user_role_assignments WHERE user_id = $1 ORDER BY role_id",
            user_id,
        )
        return [self._row_to_assignment(r) for r in rows]

    async def list_assignments_for_role(
        self, role_id: str
    ) -> list[UserRoleAssignment]:
        rows = await self._pool.fetch(
            "SELECT * FROM user_role_assignments WHERE role_id = $1 ORDER BY user_id",
            role_id,
        )
        return [self._row_to_assignment(r) for r in rows]

    async def list_all_assignments(self) -> list[UserRoleAssignment]:
        rows = await self._pool.fetch(
            "SELECT * FROM user_role_assignments ORDER BY user_id, role_id"
        )
        return [self._row_to_assignment(r) for r in rows]

    async def save_assignment(self, assignment: UserRoleAssignment) -> None:
        await self._pool.execute(
            """
            INSERT INTO user_role_assignments (id, user_id, role_id, asset_id)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (id) DO UPDATE SET
                user_id = EXCLUDED.user_id,
                role_id = EXCLUDED.role_id,
                asset_id = EXCLUDED.asset_id
            """,
            assignment.id,
            assignment.user_id,
            assignment.role_id,
            assignment.asset_id,
        )

    async def delete_assignment(self, assignment_id: str) -> None:
        await self._pool.execute(
            "DELETE FROM user_role_assignments WHERE id = $1", assignment_id
        )

    async def delete_assignments_for_user(self, user_id: str) -> None:
        await self._pool.execute(
            "DELETE FROM user_role_assignments WHERE user_id = $1", user_id
        )

    async def update_null_asset_ids(self, root_asset_id: str) -> None:
        await self._pool.execute(
            "UPDATE user_role_assignments SET asset_id = $1 WHERE asset_id IS NULL",
            root_asset_id,
        )
