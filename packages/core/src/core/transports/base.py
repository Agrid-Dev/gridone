from abc import ABC, abstractmethod
from typing import ClassVar, TypeVar

from core.types import AttributeValueType, TransportProtocols

from .read_handler_registry import ReadHandler, ReadHandlerRegistry
from .transport_address import RawTransportAddress, TransportAddress

T_TransportAddress = TypeVar("T_TransportAddress", bound=TransportAddress)


class TransportClient[T_TransportAddress](ABC):
    protocol: ClassVar[TransportProtocols]
    address_builder: ClassVar[type[T_TransportAddress]]
    _handlers_registry: ReadHandlerRegistry

    def __init__(self) -> None:
        self._handlers_registry = ReadHandlerRegistry()

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
    async def connect(self) -> None:
        """Establish a connection to the transport."""
        raise NotImplementedError

    @abstractmethod
    async def close(self) -> None:
        """Close the connection and release resources."""
        raise NotImplementedError

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

    # Default implementation for async context manager
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
