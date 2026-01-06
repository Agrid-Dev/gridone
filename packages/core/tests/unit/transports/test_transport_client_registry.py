import pytest
from core.transports import TransportClient
from core.transports.base_transport_config import BaseTransportConfig
from core.transports.factory import HttpTransportConfig, MqttTransportConfig, Transport
from core.transports.transport_address import TransportAddress
from core.transports.transport_client_registry import TransportClientRegistry
from core.types import TransportProtocols

## Mock data structures and functions


class MockTransportAddress(TransportAddress):
    address_id: int


class MockTransportConfig(BaseTransportConfig):
    ip: str
    port: int


class MockHttpTransportClient(TransportClient[MockTransportAddress]):
    address_builder = MockTransportAddress
    protocol = TransportProtocols.HTTP
    config: HttpTransportConfig

    async def connect(self) -> None:
        await super().connect()

    async def close(self) -> None:
        await super().close()

    async def read(self, address: MockTransportAddress):
        raise NotImplementedError("This is a test")

    async def write(self, address: MockTransportAddress, value) -> None:
        raise NotImplementedError("This is a test")


class MockMqttTransportClient(TransportClient[MockTransportAddress]):
    address_builder = MockTransportAddress
    protocol = TransportProtocols.MQTT
    config: MqttTransportConfig

    async def connect(self) -> None:
        await super().connect()

    async def close(self) -> None:
        await super().close()

    async def read(self, address: MockTransportAddress):
        raise NotImplementedError("This is a test")

    async def write(self, address: MockTransportAddress, value) -> None:
        raise NotImplementedError("This is a test")


def mock_transport_client_factory(transport: Transport):
    if transport.protocol == TransportProtocols.HTTP:
        return MockHttpTransportClient(transport.config)
    if transport.protocol == TransportProtocols.MQTT:
        return MockMqttTransportClient(transport.config)
    msg = f"Protocol: {transport.protocol} not supported in this test"
    raise ValueError(msg)


## Test


@pytest.fixture
def registry() -> TransportClientRegistry:
    return TransportClientRegistry(
        client_factory=mock_transport_client_factory,
    )


def test_get_transport_client_once(registry: TransportClientRegistry):
    transport = registry.get_transport(TransportProtocols.HTTP, {"request_timeout": 20})
    assert transport.protocol == TransportProtocols.HTTP
    assert transport.config.request_timeout == 20  # ty:ignore[possibly-missing-attribute]


def test_get_transport_client_twice(registry: TransportClientRegistry):
    raw_config = {"request_timeout": 20}
    transport_1 = registry.get_transport(TransportProtocols.HTTP, raw_config)
    transport_2 = registry.get_transport(TransportProtocols.HTTP, raw_config)
    assert transport_2 is transport_1
    assert len(registry) == 1


def test_get_transport_client_several_configs(registry: TransportClientRegistry):
    transport_1 = registry.get_transport(
        TransportProtocols.HTTP, {"request_timeout": 20}
    )
    transport_2 = registry.get_transport(
        TransportProtocols.HTTP, {"request_timeout": 30}
    )
    assert transport_2 is not transport_1
    assert len(registry) == 2


def test_get_transport_client_several_protocols(registry: TransportClientRegistry):
    transport_1 = registry.get_transport(
        TransportProtocols.HTTP, {"request_timeout": 20}
    )
    transport_2 = registry.get_transport(
        TransportProtocols.MQTT, {"host": "127.0.0.1", "port": 3001}
    )
    assert transport_2 is not transport_1
    assert len(registry) == 2


@pytest.mark.asyncio
async def test_clears_on_close(registry: TransportClientRegistry):
    for i in range(5):
        registry.get_transport(
            TransportProtocols.HTTP, {"request_timeout": 10 * (i + 1)}
        )
    for port in range(3000, 3005):
        registry.get_transport(
            TransportProtocols.MQTT, {"host": "127.0.0.1", "port": port}
        )

    assert len(registry) == 2 * 5
    await registry.close()
    assert len(registry) == 0


@pytest.mark.asyncio
async def test_closes_transport_on_close(registry: TransportClientRegistry):
    transport = registry.get_transport(
        TransportProtocols.MQTT, {"host": "127.0.0.1", "port": 3000}
    )
    await registry.close()
    assert not transport._is_connected
