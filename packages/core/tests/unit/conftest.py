import pytest
from core.transports import TransportMetadata

from .mocks.transport_clients import MockPushTransportClient, MockTransportClient


@pytest.fixture
def mock_transport_client() -> MockTransportClient:
    return MockTransportClient()


@pytest.fixture
def mock_push_transport_client() -> MockPushTransportClient:
    return MockPushTransportClient()


@pytest.fixture
def mock_metadata() -> TransportMetadata:
    return TransportMetadata(id="my-transport", name="My Transport")
