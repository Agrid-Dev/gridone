from core.types import TransportProtocols

from .base import TransportClient
from .factory import (
    TransportClientFactory,
    TransportConfigFactory,
    make_transport_client,
    make_transport_config,
)
from .hash_model import hash_model
from .transport_config import TransportConfig

type TransportKey = tuple[TransportProtocols, str]


def make_transport_key(
    protocol: TransportProtocols, config: TransportConfig
) -> TransportKey:
    config_key = hash_model(config)
    return (protocol, config_key)


class TransportClientRegistry:
    _transports: dict[tuple[TransportProtocols, str], TransportClient]
    _make_transport_config: TransportConfigFactory
    _make_transport_client: TransportClientFactory

    def __init__(
        self,
        *,
        config_factory: TransportConfigFactory = make_transport_config,
        client_factory: TransportClientFactory = make_transport_client,
    ) -> None:
        self._transports = {}
        self._make_transport_config = config_factory
        self._make_transport_client = client_factory

    def __len__(self) -> int:
        return len(self._transports)

    def get_transport(
        self, protocol: TransportProtocols, raw_config: dict
    ) -> TransportClient:
        """
        Returns a transport client for the given protocol and config.
        If an existing one matches, it will be returned, otherwise a new one created.
        """
        config = self._make_transport_config(protocol, raw_config)
        key = make_transport_key(protocol, config)
        if key not in self._transports:
            self._transports[key] = self._make_transport_client(protocol, config)
        return self._transports[key]

    async def close(self) -> None:
        """Close and delete all transport clients."""
        for transport in self._transports.values():
            await transport.close()
        self._transports.clear()
