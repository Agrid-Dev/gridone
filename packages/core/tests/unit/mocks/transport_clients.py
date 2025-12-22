from typing import TYPE_CHECKING, Any

from core.transports import (
    PushTransportAddress,
    PushTransportClient,
    RawTransportAddress,
    TransportAddress,
    TransportClient,
)
from core.transports.listener_registry import ListenerCallback, ListenerRegistry
from core.transports.transport_config import TransportConfig
from core.types import AttributeValueType, TransportProtocols
from pydantic import BaseModel

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
        self._listen_handlers: dict[str, tuple[str, Callable]] = {}
        self._is_connected = False

    def build_address(
        self, raw_address: RawTransportAddress, context: dict
    ) -> MockTransportAddress:
        if isinstance(raw_address, str):
            return MockTransportAddress(raw_address.format(**context))
        return MockTransportAddress(str(raw_address))

    async def read(self, address: MockTransportAddress):  # noqa: ANN201, ARG002
        return "default_value"

    async def write(
        self, address: MockTransportAddress, value: AttributeValueType
    ) -> None:
        pass

    async def connect(self) -> None:
        self._is_connected = True

    async def close(self) -> None:
        self._is_connected = False


class MockPushTransportAddress(PushTransportAddress, BaseModel):
    topic: str

    @property
    def id(self) -> str:
        return self.topic

    @classmethod
    def from_str(
        cls,
        address_str: str,
        extra_context: dict | None = None,  # noqa: ARG003
    ) -> "MockPushTransportAddress":
        return cls(topic=address_str)

    @classmethod
    def from_dict(
        cls,
        address_dict: dict,
        extra_context: dict | None = None,  # noqa: ARG003
    ) -> "MockPushTransportAddress":
        return cls(**address_dict)

    @classmethod
    def from_raw(
        cls,
        raw_address: str | dict,
        extra_context: dict | None = None,  # noqa: ARG003
    ) -> "MockPushTransportAddress":
        if isinstance(raw_address, str):
            return cls.from_str(raw_address)
        return cls.from_dict(raw_address)


class MockPushTransportClient(PushTransportClient[MockPushTransportAddress]):
    protocol = TransportProtocols.MQTT
    address_builder = MockPushTransportAddress
    _listener_registry: ListenerRegistry

    def __init__(self) -> None:
        self._listener_registry = ListenerRegistry()
        super().__init__(TransportConfig())

    def build_address(
        self, raw_address: RawTransportAddress, context: dict
    ) -> MockPushTransportAddress:
        return MockPushTransportAddress.from_raw(raw_address, context)

    async def read(self, address: MockPushTransportAddress):  # noqa: ANN201, ARG002
        return "default_value"

    async def write(
        self, address: MockPushTransportAddress, value: AttributeValueType
    ) -> None:
        pass

    async def connect(self) -> None:
        self._is_connected = True

    async def close(self) -> None:
        self._is_connected = False

    async def register_listener(self, topic: str, callback: ListenerCallback) -> str:
        return self._listener_registry.register(topic, callback)

    async def unregister_listener(
        self, listener_id: str, topic: str | None = None
    ) -> None:
        """Unregister callback on an address by callback_id."""
        return self._listener_registry.remove(listener_id, topic)

    async def simulate_event(self, topic: str, payload: Any) -> None:  # noqa: ANN401
        listeners = self._listener_registry.get_by_address_id(topic)
        for callback in listeners:
            callback(payload)
