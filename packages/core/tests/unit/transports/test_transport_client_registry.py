import pytest
from core.transports import TransportClient
from core.transports.transport_address import TransportAddress
from core.transports.transport_client_registry import TransportClientRegistry
from core.transports.transport_config import TransportConfig
from core.types import TransportProtocols

## Mock data structures and functions


class MockTransportAddress(TransportAddress):
    address_id: int


class MockTransportConfig(TransportConfig):
    ip: str
    port: int


class MockHttpTransportClient(TransportClient[MockTransportAddress]):
    address_builder = MockTransportAddress
    protocol = TransportProtocols.HTTP
    config: MockTransportConfig

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
    config: MockTransportConfig

    async def connect(self) -> None:
        await super().connect()

    async def close(self) -> None:
        await super().close()

    async def read(self, address: MockTransportAddress):
        raise NotImplementedError("This is a test")

    async def write(self, address: MockTransportAddress, value) -> None:
        raise NotImplementedError("This is a test")


def mock_transport_config_factory(
    protocol: TransportProtocols,  # noqa: ARG001
    raw_config: dict,
) -> TransportConfig:
    return MockTransportConfig(**raw_config)


def mock_transport_client_factory(
    protocol: TransportProtocols, transport_config: TransportConfig
):
    if protocol == TransportProtocols.HTTP:
        return MockHttpTransportClient(transport_config)
    if protocol == TransportProtocols.MQTT:
        return MockMqttTransportClient(transport_config)
    msg = f"Protocol: {protocol} not supported in this test"
    raise ValueError(msg)


## Test


@pytest.fixture
def registry() -> TransportClientRegistry:
    return TransportClientRegistry(
        config_factory=mock_transport_config_factory,
        client_factory=mock_transport_client_factory,
    )


def test_get_transport_client_once(registry: TransportClientRegistry):
    transport = registry.get_transport(
        TransportProtocols.HTTP, {"ip": "127.0.0.1", "port": 3001}
    )
    assert transport.protocol == TransportProtocols.HTTP
    assert transport.config.ip == "127.0.0.1"  # ty:ignore[possibly-missing-attribute]
    assert transport.config.port == 3001  # ty:ignore[possibly-missing-attribute]


def test_get_transport_client_twice(registry: TransportClientRegistry):
    raw_config = {"ip": "127.0.0.1", "port": 3001}
    transport_1 = registry.get_transport(TransportProtocols.HTTP, raw_config)
    transport_2 = registry.get_transport(TransportProtocols.HTTP, raw_config)
    assert transport_2 is transport_1
    assert len(registry) == 1


def test_get_transport_client_several_configs(registry: TransportClientRegistry):
    transport_1 = registry.get_transport(
        TransportProtocols.HTTP, {"ip": "127.0.0.1", "port": 3001}
    )
    transport_2 = registry.get_transport(
        TransportProtocols.HTTP, {"ip": "127.0.0.1", "port": 3002}
    )
    assert transport_2 is not transport_1
    assert len(registry) == 2


def test_get_transport_client_several_protocols(registry: TransportClientRegistry):
    transport_1 = registry.get_transport(
        TransportProtocols.HTTP, {"ip": "127.0.0.1", "port": 3001}
    )
    transport_2 = registry.get_transport(
        TransportProtocols.MQTT, {"ip": "127.0.0.1", "port": 3001}
    )
    assert transport_2 is not transport_1
    assert len(registry) == 2


@pytest.mark.asyncio
async def test_clears_on_close(registry: TransportClientRegistry):
    for protocol in [TransportProtocols.HTTP, TransportProtocols.MQTT]:
        for port in range(3000, 3005):
            registry.get_transport(protocol, {"ip": "127.0.0.1", "port": port})

    assert len(registry) == 2 * 5
    await registry.close()
    assert len(registry) == 0


@pytest.mark.asyncio
async def test_closes_transport_on_close(registry: TransportClientRegistry):
    transport = registry.get_transport(
        TransportProtocols.HTTP, {"ip": "127.0.0.1", "port": 3000}
    )
    await registry.close()
    assert not transport._is_connected
