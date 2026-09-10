"""Immutable normalized resources in the devices-manager database."""

from __future__ import annotations

from typing import TYPE_CHECKING

from devices_manager.core.presentation.resources import StoredResource
from devices_manager.storage.presentation_resources import stored, verify
from models.errors import ConflictError, NotFoundError

from .session import PostgresSession

if TYPE_CHECKING:
    from collections.abc import Mapping
    from collections.abc import Set as AbstractSet
    from contextlib import AbstractAsyncContextManager

    import asyncpg

    from devices_manager.core.presentation.resource import NormalizedImage


class PostgresPresentationResources:
    def __init__(self, pool: asyncpg.Pool | PostgresSession) -> None:
        self._pool = (
            pool if isinstance(pool, PostgresSession) else PostgresSession(pool)
        )

    def installation(self, driver_id: str) -> AbstractAsyncContextManager[None]:
        return self._pool.installation(driver_id)

    async def write_revision(
        self, driver_id: str, revision: str, resources: Mapping[str, NormalizedImage]
    ) -> None:
        """Insert the complete revision transactionally; a retry cannot replace it."""
        async with self._pool.acquire() as connection, connection.transaction():
            await connection.execute(
                "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
                driver_id + ":" + revision,
            )
            existing = await connection.fetch(
                "SELECT asset_id, data, media_type, sha256, width, height FROM "
                "dm_presentation_resources WHERE driver_id=$1 AND revision=$2",
                driver_id,
                revision,
            )
            if existing:
                candidate = {key: stored(value) for key, value in resources.items()}
                actual = {
                    row["asset_id"]: StoredResource(
                        row["data"],
                        row["media_type"],
                        row["sha256"],
                        row["width"],
                        row["height"],
                    )
                    for row in existing
                }
                if candidate != actual:
                    msg = "Presentation revision is immutable"
                    raise ConflictError(msg)
                return
            for asset_id, resource in resources.items():
                verify(stored(resource))
                await connection.execute(
                    "INSERT INTO dm_presentation_resources (driver_id, revision, "
                    "asset_id, media_type, sha256, width, height, data) VALUES "
                    "($1,$2,$3,$4,$5,$6,$7,$8)",
                    driver_id,
                    revision,
                    asset_id,
                    resource.media_type,
                    resource.sha256,
                    resource.width,
                    resource.height,
                    resource.data,
                )

    async def read(
        self, driver_id: str, revision: str, asset_id: str
    ) -> StoredResource:
        row = await self._pool.fetchrow(
            "SELECT data, media_type, sha256, width, height FROM "
            "dm_presentation_resources WHERE driver_id=$1 AND revision=$2 AND "
            "asset_id=$3",
            driver_id,
            revision,
            asset_id,
        )
        if row is None:
            msg = "Presentation resource not found"
            raise NotFoundError(msg)
        return verify(
            StoredResource(
                row["data"],
                row["media_type"],
                row["sha256"],
                row["width"],
                row["height"],
            )
        )

    async def list_revisions(self, driver_id: str) -> list[str]:
        rows = await self._pool.fetch(
            "SELECT DISTINCT revision FROM dm_presentation_resources WHERE "
            "driver_id=$1 ORDER BY revision",
            driver_id,
        )
        return [row["revision"] for row in rows]

    async def delete_revision(self, driver_id: str, revision: str) -> None:
        await self._pool.execute(
            "DELETE FROM dm_presentation_resources WHERE driver_id=$1 AND revision=$2",
            driver_id,
            revision,
        )

    async def prune(self, driver_id: str, keep: AbstractSet[str]) -> None:
        await self._pool.execute(
            "DELETE FROM dm_presentation_resources WHERE driver_id=$1 AND NOT "
            "(revision = ANY($2::text[]))",
            driver_id,
            list(keep),
        )
