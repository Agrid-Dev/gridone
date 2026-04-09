from __future__ import annotations

from typing import TYPE_CHECKING

from devices_manager.dto import (
    Transport,
    TransportCreate,
    TransportUpdate,
    transport_to_public,
)
from devices_manager.storage import NullStorageBackend
from models.errors import NotFoundError

from .id import gen_id
from .transports import (
    TransportClient,
    TransportMetadata,
    make_transport_client,
    make_transport_config,
)

if TYPE_CHECKING:
    from devices_manager.storage import StorageBackend


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
        self._storage = storage or NullStorageBackend()

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

    async def add(self, transport: TransportCreate | Transport) -> Transport:
        config = make_transport_config(
            transport.protocol, transport.config.model_dump()
        )
        transport_id = str(transport.id) if hasattr(transport, "id") else gen_id()
        metadata = TransportMetadata(id=transport_id, name=transport.name)
        client = make_transport_client(transport.protocol, config, metadata)
        self._transports[metadata.id] = client
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
        dto = transport_to_public(transport)
        await self._storage.write(transport_id, dto)
        return transport
