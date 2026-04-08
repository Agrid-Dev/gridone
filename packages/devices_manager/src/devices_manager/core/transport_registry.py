from __future__ import annotations

from devices_manager.dto import (
    TransportCreateDTO,
    TransportDTO,
    TransportUpdateDTO,
    transport_core_to_dto,
)
from models.errors import NotFoundError

from .id import gen_id
from .transports import (
    TransportClient,
    TransportMetadata,
    make_transport_client,
    make_transport_config,
)


class TransportRegistry:
    """Pure in-memory registry for transport clients."""

    _transports: dict[str, TransportClient]

    def __init__(self, transports: dict[str, TransportClient] | None = None) -> None:
        self._transports = transports if transports is not None else {}

    @property
    def all(self) -> dict[str, TransportClient]:
        return self._transports

    @property
    def ids(self) -> set[str]:
        return set(self._transports.keys())

    def list(self) -> list[TransportDTO]:
        return [transport_core_to_dto(t) for t in self._transports.values()]

    def _get_or_raise(self, transport_id: str) -> TransportClient:
        try:
            return self._transports[transport_id]
        except KeyError as e:
            msg = f"Transport {transport_id} not found"
            raise NotFoundError(msg) from e

    def get(self, transport_id: str) -> TransportClient:
        return self._get_or_raise(transport_id)

    def get_dto(self, transport_id: str) -> TransportDTO:
        client = self._get_or_raise(transport_id)
        return transport_core_to_dto(client)

    def add(self, transport: TransportCreateDTO | TransportDTO) -> TransportDTO:
        config = make_transport_config(
            transport.protocol, transport.config.model_dump()
        )
        transport_id = str(transport.id) if hasattr(transport, "id") else gen_id()
        metadata = TransportMetadata(id=transport_id, name=transport.name)
        client = make_transport_client(transport.protocol, config, metadata)
        self._transports[metadata.id] = client
        return transport_core_to_dto(client)

    def remove(self, transport_id: str) -> TransportClient:
        """Remove and return the client. Caller is responsible for closing it."""
        self._get_or_raise(transport_id)
        return self._transports.pop(transport_id)

    def update(self, transport_id: str, update: TransportUpdateDTO) -> TransportClient:
        """Apply name/config mutation to the client and return it."""
        transport = self._get_or_raise(transport_id)
        if update.name is not None:
            transport.metadata.name = update.name
        if update.config is not None:
            transport.update_config(update.config)
        return transport
