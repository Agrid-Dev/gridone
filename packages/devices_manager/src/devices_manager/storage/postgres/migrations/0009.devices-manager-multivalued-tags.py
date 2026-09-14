# ruff: noqa: INP001 -- yoyo loads migration scripts directly
"""Normalize legacy tags before allowing multiple values per key.

The preflight runs before any mutation and rejects ambiguous normalizations,
so an operator can correct legacy spelling without silently merging groups.
"""

from psycopg2.extensions import connection as Connection  # noqa: N812
from yoyo import step

from devices_manager.storage.tag_migration import canonical_tag_rows

__depends__ = {"0008.devices-manager-presentation-resources"}


def migrate(connection: Connection) -> None:
    cursor = connection.cursor()
    cursor.execute("SELECT device_id, key, value FROM dm_device_tags")
    canonical = canonical_tag_rows(cursor.fetchall())
    cursor.execute("ALTER TABLE dm_device_tags DROP CONSTRAINT dm_device_tags_pkey")
    cursor.execute("ALTER TABLE dm_device_tags ADD PRIMARY KEY (device_id, key, value)")
    cursor.execute("DELETE FROM dm_device_tags")
    if canonical:
        cursor.executemany(
            "INSERT INTO dm_device_tags (device_id, key, value) VALUES (%s, %s, %s)",
            canonical,
        )


def rollback(connection: Connection) -> None:
    # The primary key rejects a lossy downgrade after multi-value writes.
    cursor = connection.cursor()
    cursor.execute("ALTER TABLE dm_device_tags DROP CONSTRAINT dm_device_tags_pkey")
    cursor.execute("ALTER TABLE dm_device_tags ADD PRIMARY KEY (device_id, key)")


steps = [step(migrate, rollback)]
