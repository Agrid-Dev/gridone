"""Durable representation of devices, private to the storage layer.

``DeviceRecord`` and its converters never leave ``storage/``: backends
implement the core ``DeviceStorage`` port, snapshotting live
``CoreDevice`` objects on write and returning detached ``DeviceBase``
snapshots on read (assembly needs the driver and transport, resolved
above the storage layer).
"""

from datetime import datetime
from typing import Any

from pydantic import Field

from devices_manager.core.device import (
    AnyAttribute,
    Attribute,
    CoreDevice,
    DeviceBase,
)
from devices_manager.storage.storage_backend import StorageBackend
from models.metadata import ResourceMetadata


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
    tags: dict[str, str] = Field(default_factory=dict)
    attributes: dict[str, AnyAttribute] = Field(default_factory=dict)


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

    async def read(self, item_id: str) -> DeviceBase:
        return base_from_record(await self._records.read(item_id))

    async def write(self, item_id: str, device: CoreDevice) -> None:
        await self._records.write(item_id, to_record(device))

    async def read_all(self) -> list[DeviceBase]:
        return [base_from_record(record) for record in await self._records.read_all()]

    async def list_all(self) -> list[str]:
        return await self._records.list_all()

    async def delete(self, item_id: str) -> None:
        await self._records.delete(item_id)

    async def _read_for_mutation(self, device_id: str) -> DeviceRecord | None:
        try:
            return await self._records.read(device_id)
        except FileNotFoundError:
            return None

    async def set_tag(
        self, device_id: str, key: str, value: str, updated_at: datetime
    ) -> None:
        record = await self._read_for_mutation(device_id)
        if record is None:
            return
        record.tags[key] = value
        record.updated_at = updated_at
        await self._records.write(device_id, record)

    async def delete_tag(self, device_id: str, key: str, updated_at: datetime) -> None:
        record = await self._read_for_mutation(device_id)
        if record is None:
            return
        record.tags.pop(key, None)
        record.updated_at = updated_at
        await self._records.write(device_id, record)

    async def save_attribute(self, device_id: str, attribute: Attribute) -> bool:
        """Persist a single attribute value. Returns False for an unknown
        device so composites can decide whether that deserves a warning."""
        record = await self._read_for_mutation(device_id)
        if record is None:
            return False
        record.attributes[attribute.name] = attribute
        await self._records.write(device_id, record)
        return True
