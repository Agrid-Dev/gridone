import logging
from abc import ABC, abstractmethod
from asyncio import Lock
from collections.abc import Callable
from typing import ClassVar, TypeVar

from core.types import AttributeValueType, TransportProtocols

from .read_handler_registry import ReadHandler, ReadHandlerRegistry
from .transport_address import RawTransportAddress, TransportAddress
from .transport_config import TransportConfig

T_TransportAddress = TypeVar("T_TransportAddress", bound=TransportAddress)


logger = logging.getLogger(__name__)


class TransportClient[T_TransportAddress](ABC):
    protocol: ClassVar[TransportProtocols]
    address_builder: ClassVar[type[T_TransportAddress]]
    _handlers_registry: ReadHandlerRegistry
    _connection_lock: Lock
    _is_connected: bool

    def __init__(self, config: TransportConfig) -> None:
        self._handlers_registry = ReadHandlerRegistry()
        self._connection_lock = Lock()
        self._is_connected = False
        self.config = config

    def build_address(
        self, raw_address: RawTransportAddress, context: dict | None = None
    ) -> T_TransportAddress:
        return self.address_builder.from_raw(raw_address, extra_context=context)  # ty: ignore[unresolved-attribute]

    def register_read_handler(
        self, address: T_TransportAddress, handler: ReadHandler
    ) -> str:
        return self._handlers_registry.register(address.id, handler)  # ty: ignore[unresolved-attribute]

    def unregister_read_handler(
        self, handler_id: str, address: T_TransportAddress | None = None
    ) -> None:
        address_id = address.id if address else None  # ty: ignore[unresolved-attribute]
        self._handlers_registry.remove(handler_id, address_id)

    @abstractmethod
    def listen(
        self,
        topic_or_address: str | T_TransportAddress,
        handler: Callable[[str], None],
    ) -> str:
        """Subscribe to a topic or address for passive listening.

        This method is for passive listening (e.g., discovery) and is distinct
        from register_read_handler() which is for request/response patterns.

        Args:
            topic_or_address: Topic string (for transports like MQTT) or
                            transport address. For transports that don't support
                            passive listening, this will raise NotImplementedError.
            handler: Callback function that receives the message/topic content as a string.

        Returns:
            Handler ID that can be used to unsubscribe via unlisten().

        Raises:
            NotImplementedError: If the transport does not support passive listening.
        """
        ...

    @abstractmethod
    def unlisten(
        self,
        handler_id: str,
        topic_or_address: str | T_TransportAddress | None = None,
    ) -> None:
        """Unsubscribe from a topic or address and remove the handler.

        Args:
            handler_id: The handler ID returned by listen().
            topic_or_address: Optional topic string or transport address.
                           If None, the handler will be looked up and removed.
        """
        ...

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


class PushTransportClient[T_TransportAddress](TransportClient[T_TransportAddress]):
    @abstractmethod
    async def init_listeners(self) -> None: ...
