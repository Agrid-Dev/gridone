from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from models.errors import NotFoundError

if TYPE_CHECKING:
    from .transports import BaseTransportConfig, TransportClient, TransportStorage


class TransportRegistry:
    """In-memory registry for transport clients with optional persistence."""

    _transports: dict[str, TransportClient]
    _storage: TransportStorage | None

    def __init__(
        self,
        transports: dict[str, TransportClient] | None = None,
        *,
        storage: TransportStorage | None = None,
    ) -> None:
        self._transports = transports if transports is not None else {}
        self._storage = storage

    @property
    def all(self) -> dict[str, TransportClient]:
        return self._transports

    @property
    def ids(self) -> set[str]:
        return set(self._transports.keys())

    def list_all(self) -> list[TransportClient]:
        return list(self._transports.values())

    def _get_or_raise(self, transport_id: str) -> TransportClient:
        try:
            return self._transports[transport_id]
        except KeyError as e:
            msg = f"Transport {transport_id} not found"
            raise NotFoundError(msg) from e

    def get(self, transport_id: str) -> TransportClient:
        return self._get_or_raise(transport_id)

    async def _persist(self, transport: TransportClient) -> None:
        """Bump updated_at and write back. The single chokepoint every
        mutating method funnels through, so a new one can't forget to
        bump the timestamp."""
        transport.metadata.updated_at = datetime.now(UTC)
        if self._storage is not None:
            await self._storage.write(transport.id, transport)

    async def add(self, client: TransportClient) -> TransportClient:
        self._transports[client.id] = client
        if self._storage is not None:
            await self._storage.write(client.id, client)
        return client

    async def remove(self, transport_id: str) -> TransportClient:
        """Remove and return the client. Caller is responsible for closing it."""
        self._get_or_raise(transport_id)
        client = self._transports.pop(transport_id)
        if self._storage is not None:
            await self._storage.delete(transport_id)
        return client

    async def update(
        self,
        transport_id: str,
        *,
        name: str | None = None,
        config: BaseTransportConfig | dict | None = None,
    ) -> TransportClient:
        """Apply name/config mutation to the client and return it."""
        transport = self._get_or_raise(transport_id)
        if name is not None:
            transport.metadata.name = name
        if config is not None:
            transport.update_config(config)
        await self._persist(transport)
        return transport
