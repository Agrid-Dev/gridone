"""Durable representation of devices, private to the storage layer.

``DeviceRecord`` and its converters never leave ``storage/``: backends
implement the core ``DeviceStorage`` port, snapshotting live
``CoreDevice`` objects on write and returning detached ``DeviceBase``
snapshots on read (assembly needs the driver and transport, resolved
above the storage layer).
"""

from asyncio import Lock
from datetime import datetime
from typing import Any

from pydantic import Field, field_validator

from devices_manager.core.device import (
    AnyAttribute,
    Attribute,
    CoreDevice,
    DeviceBase,
)
from devices_manager.storage.storage_backend import StorageBackend
from models.metadata import ResourceMetadata
from models.tags import Tags


class DeviceRecord(ResourceMetadata):
    """Durable snapshot of a device: identity, config, tags and attribute
    state.

    Derived fields (``type``, ``is_faulty``) are never persisted — they are
    recomputed from the driver at assembly. Legacy rows/files carrying them
    stay readable through pydantic's extra-ignore.
    """

    id: str
    name: str = ""
    config: dict[str, Any] = Field(default_factory=dict)
    driver_id: str
    transport_id: str
    tags: Tags = Field(default_factory=dict)
    attributes: dict[str, AnyAttribute] = Field(default_factory=dict)

    @field_validator("tags", mode="before")
    @classmethod
    def upgrade_scalar_tags(cls, tags: object) -> object:
        """Read old YAML snapshots; all subsequent writes use value lists."""
        if not isinstance(tags, dict):
            return tags
        return {
            key: [value] if isinstance(value, str) else value
            for key, value in tags.items()
        }


def to_record(device: CoreDevice) -> DeviceRecord:
    return DeviceRecord(
        id=device.id,
        name=device.name,
        config=device.config,
        driver_id=device.driver_id,
        transport_id=device.transport_id,
        tags=device.tags,
        attributes=device.attributes,
        created_at=device.created_at,
        updated_at=device.updated_at,
    )


def base_from_record(record: DeviceRecord) -> DeviceBase:
    return DeviceBase(
        id=record.id,
        name=record.name,
        config=record.config,
        driver_id=record.driver_id,
        transport_id=record.transport_id,
        tags=record.tags,
        attributes=record.attributes,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


class RecordDeviceStorage:
    """``DeviceStorage`` port over any ``StorageBackend[DeviceRecord]``.

    Shared by the memory and yaml backends; postgres implements the port
    directly against its columnar tables. Targeted mutations (tags,
    ``save_attribute``) are read-modify-write here and no-ops when the
    device has never been persisted, matching the postgres backend's
    "no row, no row to update" semantics.
    """

    def __init__(self, records: StorageBackend[DeviceRecord]) -> None:
        self._records = records
        # Attribute polling and tag changes both replace the whole record.
        # Serialize their read-modify-write cycles so neither loses the other.
        self._mutation_lock = Lock()

    async def read(self, item_id: str) -> DeviceBase:
        return base_from_record(await self._records.read(item_id))

    async def write(self, item_id: str, device: CoreDevice) -> None:
        async with self._mutation_lock:
            await self._records.write(item_id, to_record(device))

    async def read_all(self) -> list[DeviceBase]:
        return [base_from_record(record) for record in await self._records.read_all()]

    async def list_all(self) -> list[str]:
        return await self._records.list_all()

    async def delete(self, item_id: str) -> None:
        async with self._mutation_lock:
            await self._records.delete(item_id)

    async def _read_for_mutation(self, device_id: str) -> DeviceRecord | None:
        try:
            return await self._records.read(device_id)
        except FileNotFoundError:
            return None

    async def set_tag(
        self, device_id: str, key: str, values: list[str], updated_at: datetime
    ) -> None:
        async with self._mutation_lock:
            record = await self._read_for_mutation(device_id)
            if record is None:
                return
            if values:
                record.tags[key] = list(values)
            else:
                record.tags.pop(key, None)
            record.updated_at = updated_at
            await self._records.write(device_id, record)

    async def delete_tag(self, device_id: str, key: str, updated_at: datetime) -> None:
        await self.set_tag(device_id, key, [], updated_at)

    async def save_attribute(self, device_id: str, attribute: Attribute) -> bool:
        """Persist a single attribute value. Returns False for an unknown
        device so composites can decide whether that deserves a warning."""
        async with self._mutation_lock:
            record = await self._read_for_mutation(device_id)
            if record is None:
                return False
            record.attributes[attribute.name] = attribute
            await self._records.write(device_id, record)
            return True
