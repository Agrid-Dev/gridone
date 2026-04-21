from __future__ import annotations

from collections import defaultdict
from typing import TYPE_CHECKING, cast

from devices_manager.core.device import Attribute
from devices_manager.dto import Device
from devices_manager.storage.storage_backend import StorageBackend
from devices_manager.types import AttributeValueType, DataType, DeviceKind

if TYPE_CHECKING:
    import asyncpg


class PostgresDeviceStorage(StorageBackend[Device]):
    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    def _build_dto(
        self,
        row: asyncpg.Record,
        attribute_rows: list[asyncpg.Record],
        tag_rows: list[asyncpg.Record],
    ) -> Device:
        attributes: dict[str, Attribute] = {}
        for attr_row in attribute_rows:
            raw_modes = attr_row["read_write_modes"]
            attributes[attr_row["name"]] = Attribute(
                name=attr_row["name"],
                data_type=DataType(attr_row["data_type"]),
                read_write_modes=set(raw_modes) if raw_modes else set(),
                current_value=cast(
                    "AttributeValueType | None",
                    attr_row["current_value"],
                ),
                last_updated=attr_row["last_updated"],
                last_changed=attr_row["last_changed"],
            )

        config = row["config"]
        tags = {tag_row["key"]: tag_row["value"] for tag_row in tag_rows}
        # Storage rehydrates plain `Attribute` instances (no FaultAttribute
        # subclass), so the DTO's is_faulty is always False here. The runtime
        # is_faulty is recomputed once the DevicesManager bootstraps the
        # CoreDevice from the driver spec, which re-creates FaultAttribute
        # instances with their healthy_values/severity.
        return Device(
            id=row["id"],
            kind=DeviceKind(row["kind"]),
            name=row["name"],
            type=row["type"],
            tags=tags,
            config=cast("dict | None", config) if config else None,
            driver_id=row["driver_id"],
            transport_id=row["transport_id"],
            attributes=attributes,
            is_faulty=False,
        )

    async def read(self, item_id: str) -> Device:
        row = await self._pool.fetchrow(
            "SELECT id, kind, name, type, config, driver_id, transport_id "
            "FROM dm_devices WHERE id = $1",
            item_id,
        )
        if row is None:
            msg = f"dm_devices entry '{item_id}' not found"
            raise FileNotFoundError(msg)

        attr_rows, tag_rows = await _fetch_attrs_and_tags(self._pool, [item_id])
        return self._build_dto(row, attr_rows, tag_rows)

    async def write(self, item_id: str, data: Device) -> None:
        dumped = data.model_dump(mode="json")

        async with self._pool.acquire() as conn, conn.transaction():
            await conn.execute(
                "INSERT INTO dm_devices"
                " (id, kind, name, type, config, driver_id, transport_id)"
                " VALUES ($1, $2, $3, $4, $5, $6, $7)"
                " ON CONFLICT (id) DO UPDATE SET"
                " kind = EXCLUDED.kind, name = EXCLUDED.name,"
                " type = EXCLUDED.type, config = EXCLUDED.config,"
                " driver_id = EXCLUDED.driver_id,"
                " transport_id = EXCLUDED.transport_id",
                item_id,
                dumped["kind"],
                dumped["name"],
                dumped.get("type"),
                dumped["config"] if dumped.get("config") else None,
                dumped.get("driver_id"),
                dumped.get("transport_id"),
            )

            await _write_tags(conn, item_id, data.tags)

            if data.attributes:
                await self._upsert_attributes(conn, item_id, data.attributes)

    async def _upsert_attributes(
        self,
        conn: asyncpg.Connection,
        device_id: str,
        attributes: dict[str, Attribute],
    ) -> None:
        # Delete attributes no longer present
        existing = await conn.fetch(
            "SELECT name FROM dm_device_attributes WHERE device_id = $1",
            device_id,
        )
        existing_names = {row["name"] for row in existing}
        removed = existing_names - set(attributes.keys())
        if removed:
            await conn.execute(
                "DELETE FROM dm_device_attributes "
                "WHERE device_id = $1 AND name = ANY($2::text[])",
                device_id,
                list(removed),
            )

        # Upsert current attributes
        for attr in attributes.values():
            await conn.execute(
                "INSERT INTO dm_device_attributes "
                "(device_id, name, data_type, read_write_modes, "
                "current_value, last_updated, last_changed) "
                "VALUES ($1, $2, $3, $4, $5, $6, $7) "
                "ON CONFLICT (device_id, name) DO UPDATE SET "
                "data_type = EXCLUDED.data_type, "
                "read_write_modes = EXCLUDED.read_write_modes, "
                "current_value = EXCLUDED.current_value, "
                "last_updated = EXCLUDED.last_updated, "
                "last_changed = EXCLUDED.last_changed",
                device_id,
                attr.name,
                attr.data_type.value,
                list(attr.read_write_modes),
                attr.model_dump(mode="json")["current_value"],
                attr.last_updated,
                attr.last_changed,
            )

    async def save_attribute(self, device_id: str, attribute: Attribute) -> None:
        """Persist a single attribute value (upsert)."""
        await self._pool.execute(
            "INSERT INTO dm_device_attributes "
            "(device_id, name, data_type, read_write_modes, "
            "current_value, last_updated, last_changed) "
            "VALUES ($1, $2, $3, $4, $5, $6, $7) "
            "ON CONFLICT (device_id, name) DO UPDATE SET "
            "data_type = EXCLUDED.data_type, "
            "read_write_modes = EXCLUDED.read_write_modes, "
            "current_value = EXCLUDED.current_value, "
            "last_updated = EXCLUDED.last_updated, "
            "last_changed = EXCLUDED.last_changed",
            device_id,
            attribute.name,
            attribute.data_type.value,
            list(attribute.read_write_modes),
            attribute.model_dump(mode="json")["current_value"],
            attribute.last_updated,
            attribute.last_changed,
        )

    async def read_all(self) -> list[Device]:
        device_rows = await self._pool.fetch(
            "SELECT id, kind, name, type, config, driver_id, transport_id "
            "FROM dm_devices ORDER BY id",
        )
        if not device_rows:
            return []

        device_ids = [row["id"] for row in device_rows]
        attr_rows, tag_rows = await _fetch_attrs_and_tags(self._pool, device_ids)

        attrs_by_device: dict[str, list[asyncpg.Record]] = defaultdict(list)
        for attr_row in attr_rows:
            attrs_by_device[attr_row["device_id"]].append(attr_row)

        tags_by_device: dict[str, list[asyncpg.Record]] = defaultdict(list)
        for tag_row in tag_rows:
            tags_by_device[tag_row["device_id"]].append(tag_row)

        return [
            self._build_dto(
                row,
                attrs_by_device.get(row["id"], []),
                tags_by_device.get(row["id"], []),
            )
            for row in device_rows
        ]

    async def list_all(self) -> list[str]:
        rows = await self._pool.fetch("SELECT id FROM dm_devices ORDER BY id")
        return [row["id"] for row in rows]

    async def delete(self, item_id: str) -> None:
        # dm_device_attributes and dm_device_tags cascade-deleted via FK
        result = await self._pool.execute(
            "DELETE FROM dm_devices WHERE id = $1", item_id
        )
        if result == "DELETE 0":
            msg = f"dm_devices entry '{item_id}' not found"
            raise FileNotFoundError(msg)


async def _fetch_attrs_and_tags(
    pool: asyncpg.Pool,
    device_ids: list[str],
) -> tuple[list[asyncpg.Record], list[asyncpg.Record]]:
    attr_rows = await pool.fetch(
        "SELECT device_id, name, data_type, read_write_modes, "
        "current_value, last_updated, last_changed "
        "FROM dm_device_attributes WHERE device_id = ANY($1::text[])",
        device_ids,
    )
    tag_rows = await pool.fetch(
        "SELECT device_id, key, value FROM dm_device_tags"
        " WHERE device_id = ANY($1::text[])",
        device_ids,
    )
    return list(attr_rows), list(tag_rows)


async def _write_tags(
    conn: asyncpg.Connection,
    device_id: str,
    tags: dict[str, str],
) -> None:
    await conn.execute("DELETE FROM dm_device_tags WHERE device_id = $1", device_id)
    for key, value in tags.items():
        await conn.execute(
            "INSERT INTO dm_device_tags (device_id, key, value) VALUES ($1, $2, $3)",
            device_id,
            key,
            value,
        )
