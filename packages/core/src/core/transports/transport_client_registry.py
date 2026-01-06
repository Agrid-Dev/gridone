from core.types import TransportProtocols

from .base import TransportClient
from .factory import (
    Transport,
    TransportClientFactory,
    make_transport_client,
    parse_transport,
)
from .hash_model import hash_model

type TransportKey = tuple[TransportProtocols, str]


def make_transport_key(transport: Transport) -> TransportKey:
    config_key = hash_model(transport.config)
    return (transport.protocol, config_key)


class TransportClientRegistry:
    _clients: dict[tuple[TransportProtocols, str], TransportClient]
    _make_transport_client: TransportClientFactory

    def __init__(
        self,
        *,
        client_factory: TransportClientFactory = make_transport_client,
    ) -> None:
        self._clients = {}
        self._make_transport_client = client_factory

    def __len__(self) -> int:
        return len(self._clients)

    def get_transport(
        self, protocol: TransportProtocols, raw_config: dict
    ) -> TransportClient:
        """
        Returns a transport client for the given protocol and config.
        If an existing one matches, it will be returned, otherwise a new one created.
        """
        transport = parse_transport({"protocol": protocol, "config": raw_config})
        key = make_transport_key(transport)
        if key not in self._clients:
            self._clients[key] = self._make_transport_client(transport)
        return self._clients[key]

    async def close(self) -> None:
        """Close and delete all transport clients."""
        for client in self._clients.values():
            await client.close()
        self._clients.clear()
