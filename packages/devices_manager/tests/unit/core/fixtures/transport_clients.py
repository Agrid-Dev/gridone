from typing import TYPE_CHECKING, Any

import pytest
from devices_manager.core.transports import (
    BaseTransportConfig,
    PushTransportAddress,
    PushTransportClient,
    RawTransportAddress,
    TransportAddress,
    TransportClient,
    TransportMetadata,
)
from devices_manager.core.transports.factory import make_transport_config
from devices_manager.core.transports.http_transport import HttpTransportConfig
from devices_manager.core.transports.listener_registry import (
    ListenerCallback,
    ListenerRegistry,
)
from devices_manager.core.transports.mqtt_transport import MqttTransportConfig
from devices_manager.types import AttributeValueType, TransportProtocols
from pydantic import BaseModel

if TYPE_CHECKING:
    from collections.abc import Callable

mock_metadata = TransportMetadata(id="my-transport", name="My Transport")


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
    metadata = mock_metadata
    _config_builder = HttpTransportConfig

    def __init__(
        self, metadata: TransportMetadata, config: BaseTransportConfig
    ) -> None:
        self._listen_handlers: dict[str, tuple[str, Callable]] = {}
        self._is_connected = False
        super().__init__(metadata, config)

    def build_address(
        self, raw_address: RawTransportAddress, context: dict | None = None
    ) -> MockTransportAddress:
        if isinstance(raw_address, str):
            return MockTransportAddress(raw_address.format(**(context or {})))
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
    _config_builder = MqttTransportConfig

    def __init__(
        self, metadata: TransportMetadata, config: BaseTransportConfig
    ) -> None:
        self._listener_registry = ListenerRegistry()
        super().__init__(metadata, config)

    def build_address(
        self, raw_address: RawTransportAddress, context: dict | None = None
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
        self, callback_id: str, topic: str | None = None
    ) -> None:
        """Unregister callback on an address by callback_id."""
        return self._listener_registry.remove(callback_id, topic)

    async def simulate_event(self, topic: str, payload: Any) -> None:  # noqa: ANN401
        listeners = self._listener_registry.get_by_address_id(topic)
        for callback in listeners:
            callback(payload)


@pytest.fixture
def mock_transport_client() -> MockTransportClient:
    metadata = TransportMetadata(id="my-transport", name="My Transport")
    config = make_transport_config(TransportProtocols.HTTP, {})
    return MockTransportClient(metadata, config)


@pytest.fixture
def second_mock_transport_client() -> MockTransportClient:
    metadata = TransportMetadata(id="http-2", name="Second HTTP Transport")
    config = make_transport_config(TransportProtocols.HTTP, {})
    return MockTransportClient(metadata, config)


@pytest.fixture
def mock_push_transport_client() -> MockPushTransportClient:
    metadata = TransportMetadata(id="my-push-transport", name="My Push Transport")
    config = make_transport_config(TransportProtocols.MQTT, {"host": "localhost"})

    return MockPushTransportClient(metadata, config)


@pytest.fixture
def mock_transport_metadata() -> TransportMetadata:
    return TransportMetadata(id="my-transport", name="My Transport")
