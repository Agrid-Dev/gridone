import logging
from abc import ABC, abstractmethod
from asyncio import Lock
from typing import ClassVar, TypeVar

from core.types import AttributeValueType, TransportProtocols

from .base_transport_config import BaseTransportConfig
from .listener_registry import ListenerCallback, ListenerRegistry
from .transport_address import (
    PushTransportAddress,
    RawTransportAddress,
    TransportAddress,
)
from .transport_metadata import TransportMetadata

T_TransportAddress = TypeVar("T_TransportAddress", bound=TransportAddress)


logger = logging.getLogger(__name__)


class TransportClient[T_TransportAddress](ABC):
    protocol: ClassVar[TransportProtocols]
    config: BaseTransportConfig
    metadata: TransportMetadata
    address_builder: ClassVar[type[T_TransportAddress]]
    _connection_lock: Lock
    _is_connected: bool

    def __init__(
        self, metadata: TransportMetadata, config: BaseTransportConfig
    ) -> None:
        self._handlers_registry = ListenerRegistry()
        self._connection_lock = Lock()
        self._is_connected = False
        self.config = config
        self.metadata = metadata

    def build_address(
        self, raw_address: RawTransportAddress, context: dict | None = None
    ) -> T_TransportAddress:
        return self.address_builder.from_raw(raw_address, extra_context=context)  # ty: ignore[unresolved-attribute]

    @abstractmethod
    async def connect(self) -> None:
        """Establish a connection to the transport."""
        self._is_connected = True
        logger.info("Transport client %s connected", self.protocol)

    @abstractmethod
    async def close(self) -> None:
        """Close the connection and release resources."""
        self._is_connected = False
        logger.info("Transport client %s closed", self.protocol)

    @abstractmethod
    async def read(self, address: T_TransportAddress) -> AttributeValueType:
        """Read a value from the transport."""
        ...

    @abstractmethod
    async def write(
        self,
        address: T_TransportAddress,
        value: AttributeValueType,
    ) -> None:
        """Write a value to the transport."""
        ...

    async def __aenter__(self) -> "TransportClient[T_TransportAddress]":
        """Support async context manager (async with)."""
        await self.connect()
        return self

    async def __aexit__(
        self,
        exc_type: object,
        exc_val: BaseException | None,
        exc_tb: object,
    ) -> None:
        """Ensure the client is closed when exiting the context."""
        await self.close()


T_PushTransportAddress = TypeVar("T_PushTransportAddress", bound=PushTransportAddress)


class PushTransportClient[T_PushTransportAddress](
    TransportClient[T_PushTransportAddress]
):
    @abstractmethod
    async def register_listener(self, topic: str, callback: ListenerCallback) -> str:
        """Register a listener on an address
        with a handler when receiving data on the address."""

    @abstractmethod
    async def unregister_listener(
        self, callback_id: str, topic: str | None = None
    ) -> None:
        """Unregister handler on an address by handler_id."""
