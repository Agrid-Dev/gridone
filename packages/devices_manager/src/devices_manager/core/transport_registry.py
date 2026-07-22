from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from devices_manager.dto import (
    Transport,
    TransportCreate,
    TransportUpdate,
    transport_to_public,
)
from devices_manager.storage.memory import MemoryStorageBackend
from models.errors import NotFoundError
from models.ids import gen_id

from .transports import (
    TransportClient,
    TransportMetadata,
    make_transport_client,
    make_transport_config,
)

if TYPE_CHECKING:
    from devices_manager.storage import StorageBackend


def build_transport_client(transport: TransportCreate | Transport) -> TransportClient:
    """Build a transport client from a create payload or a stored DTO.

    ``TransportCreate`` carries no timestamps (fresh transport), so
    ``TransportMetadata`` falls back to its own defaults in that case; a
    stored ``Transport`` always carries them through unchanged.
    """
    config = make_transport_config(transport.protocol, transport.config.model_dump())
    transport_id = str(transport.id) if hasattr(transport, "id") else gen_id()
    timestamps = {}
    created_at = getattr(transport, "created_at", None)
    updated_at = getattr(transport, "updated_at", None)
    if created_at is not None:
        timestamps["created_at"] = created_at
    if updated_at is not None:
        timestamps["updated_at"] = updated_at
    metadata = TransportMetadata(id=transport_id, name=transport.name, **timestamps)
    return make_transport_client(transport.protocol, config, metadata)


class TransportRegistry:
    """In-memory registry for transport clients with optional persistence."""

    _transports: dict[str, TransportClient]
    _storage: StorageBackend[Transport]

    def __init__(
        self,
        transports: dict[str, TransportClient] | None = None,
        *,
        storage: StorageBackend[Transport] | None = None,
    ) -> None:
        self._transports = transports if transports is not None else {}
        self._storage = (
            storage if storage is not None else MemoryStorageBackend[Transport]()
        )

    @property
    def all(self) -> dict[str, TransportClient]:
        return self._transports

    @property
    def ids(self) -> set[str]:
        return set(self._transports.keys())

    def list_all(self) -> list[Transport]:
        return [transport_to_public(t) for t in self._transports.values()]

    def _get_or_raise(self, transport_id: str) -> TransportClient:
        try:
            return self._transports[transport_id]
        except KeyError as e:
            msg = f"Transport {transport_id} not found"
            raise NotFoundError(msg) from e

    def get(self, transport_id: str) -> TransportClient:
        return self._get_or_raise(transport_id)

    def get_dto(self, transport_id: str) -> Transport:
        client = self._get_or_raise(transport_id)
        return transport_to_public(client)

    async def _persist(self, transport: TransportClient) -> Transport:
        """Bump updated_at and write back. The single chokepoint every
        mutating method funnels through, so a new one can't forget to
        bump the timestamp."""
        transport.metadata.updated_at = datetime.now(UTC)
        dto = transport_to_public(transport)
        await self._storage.write(transport.id, dto)
        return dto

    async def add(self, transport: TransportCreate | Transport) -> Transport:
        client = build_transport_client(transport)
        self._transports[client.id] = client
        dto = transport_to_public(client)
        await self._storage.write(dto.id, dto)
        return dto

    async def remove(self, transport_id: str) -> TransportClient:
        """Remove and return the client. Caller is responsible for closing it."""
        self._get_or_raise(transport_id)
        client = self._transports.pop(transport_id)
        await self._storage.delete(transport_id)
        return client

    async def update(
        self, transport_id: str, update: TransportUpdate
    ) -> TransportClient:
        """Apply name/config mutation to the client and return it."""
        transport = self._get_or_raise(transport_id)
        if update.name is not None:
            transport.metadata.name = update.name
        if update.config is not None:
            transport.update_config(update.config)
        await self._persist(transport)
        return transport
