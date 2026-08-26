"""Durable representation of transports, private to the storage layer.

``TransportRecord`` and its converters never leave ``storage/``: backends
implement the core ``TransportStorage`` port and exchange live
``TransportClient`` objects with the rest of the package.
"""

from typing import Any

from pydantic import Field

from devices_manager.core.transports import (
    TransportClient,
    TransportMetadata,
    make_transport_client,
    make_transport_config,
)
from devices_manager.storage.storage_backend import StorageBackend
from devices_manager.types import TransportProtocols
from models.metadata import ResourceMetadata


class TransportRecord(ResourceMetadata):
    """Durable snapshot of a transport: identity + config only.

    Connection state is runtime status and is never persisted — hydrated
    clients always start idle. ``name``/``config`` default so rows or files
    written before this model stay readable, and pydantic's extra-ignore
    drops the legacy ``connection_state`` key.
    """

    id: str
    name: str = ""
    protocol: TransportProtocols
    config: dict[str, Any] = Field(default_factory=dict)


def to_record(client: TransportClient) -> TransportRecord:
    return TransportRecord(
        id=client.id,
        name=client.metadata.name,
        protocol=client.protocol,
        config=client.config.model_dump(mode="json"),
        created_at=client.metadata.created_at,
        updated_at=client.metadata.updated_at,
    )


def from_record(record: TransportRecord) -> TransportClient:
    config = make_transport_config(record.protocol, record.config)
    metadata = TransportMetadata(
        id=record.id,
        name=record.name,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )
    return make_transport_client(record.protocol, config, metadata)


class RecordTransportStorage:
    """``TransportStorage`` port over any ``StorageBackend[TransportRecord]``.

    Shared by the memory and yaml backends; postgres implements the port
    directly against its columnar table.
    """

    def __init__(self, records: StorageBackend[TransportRecord]) -> None:
        self._records = records

    async def read(self, item_id: str) -> TransportClient:
        return from_record(await self._records.read(item_id))

    async def write(self, item_id: str, client: TransportClient) -> None:
        await self._records.write(item_id, to_record(client))

    async def read_all(self) -> list[TransportClient]:
        return [from_record(record) for record in await self._records.read_all()]

    async def list_all(self) -> list[str]:
        return await self._records.list_all()

    async def delete(self, item_id: str) -> None:
        await self._records.delete(item_id)
