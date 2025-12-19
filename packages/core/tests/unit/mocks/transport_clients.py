from typing import TYPE_CHECKING

from core.transports import (
    PushTransportClient,
    RawTransportAddress,
    TransportAddress,
    TransportClient,
)
from core.transports.read_handler_registry import ReadHandler, ReadHandlerRegistry
from core.types import AttributeValueType, TransportProtocols

if TYPE_CHECKING:
    from collections.abc import Callable


class MockTransportAddress(TransportAddress):
    def __init__(self, address: str) -> None:
        self.address = address

    @property
    def id(self) -> str:
        return self.address

    @classmethod
    def from_str(
        cls,
        address_str: str,
        extra_context: dict | None = None,  # noqa: ARG003
    ) -> "MockTransportAddress":
        return cls(address_str)

    @classmethod
    def from_dict(
        cls,
        address_dict: dict,
        extra_context: dict | None = None,  # noqa: ARG003
    ) -> "MockTransportAddress":
        return cls(str(address_dict))

    @classmethod
    def from_raw(
        cls,
        raw_address: str | dict,
        extra_context: dict | None = None,  # noqa: ARG003
    ) -> "MockTransportAddress":
        if isinstance(raw_address, str):
            return cls(raw_address)
        return cls(str(raw_address))


class MockTransportClient(TransportClient[MockTransportAddress]):
    protocol = TransportProtocols.HTTP
    address_builder = MockTransportAddress

    def __init__(self) -> None:
        self._read_handlers: dict[str, Callable] = {}
        self._listen_handlers: dict[str, tuple[str, Callable]] = {}
        self._handler_counter = 0
        self._is_connected = False

    def build_address(self, raw_address: RawTransportAddress, context: dict):
        if isinstance(raw_address, str):
            return MockTransportAddress(raw_address.format(**context))
        return MockTransportAddress(str(raw_address))

    async def read(self, address: MockTransportAddress):  # noqa: ANN201
        handler = self._read_handlers.get(address.address)
        if handler:
            return handler()
        return "default_value"

    async def write(
        self, address: MockTransportAddress, value: AttributeValueType
    ) -> None:
        pass

    async def connect(self) -> None:
        self._is_connected = True

    async def close(self) -> None:
        self._is_connected = False


class MockPushTransportClient(PushTransportClient, MockTransportClient):
    _listener_registry: ReadHandlerRegistry

    def __init__(self) -> None:
        self._listener_registry = ReadHandlerRegistry()

    async def register_listener(
        self, address: MockTransportAddress, handler: ReadHandler
    ) -> str:
        return self._listener_registry.register(address.id, handler)

    async def unregister_listener(
        self, handler_id: str, address: MockTransportAddress | None = None
    ) -> None:
        """Unregister handler on an address by handler_id."""
        address_id = address.id if address else None
        return self._listener_registry.remove(handler_id, address_id)
