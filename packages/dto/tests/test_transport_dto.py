import pytest
from devices_manager.transports import TransportConnectionState, TransportMetadata
from devices_manager.transports.http_transport import (
    HTTPTransportClient,
    HttpTransportConfig,
)
from devices_manager.transports.mqtt_transport import (
    MqttTransportClient,
    MqttTransportConfig,
)
from devices_manager.types import TransportProtocols
from dto.transport_dto import MqttTransportDTO, core_to_dto, dto_to_core


@pytest.fixture
def mock_metadata():
    return TransportMetadata(id="my-transport", name="My Transport")


def test_core_to_dto(mock_metadata):
    client = HTTPTransportClient(config=HttpTransportConfig(), metadata=mock_metadata)
    dto = core_to_dto(client)
    assert dto.id == client.metadata.id
    assert dto.name == client.metadata.name
    assert dto.config == client.config
    assert dto.protocol == client.protocol
    assert dto.connection_state == client.connection_state


def test_dto_to_core(mock_metadata):
    dto = MqttTransportDTO(
        id=mock_metadata.id,
        name=mock_metadata.name,
        protocol=TransportProtocols.MQTT,
        config=MqttTransportConfig(host="localhost"),
        connection_state=TransportConnectionState.idle(),
    )
    client = dto_to_core(dto)
    assert isinstance(client, MqttTransportClient)
    assert client.metadata.id == dto.id
    assert client.metadata.name == dto.name
    assert client.config == dto.config
    assert client.protocol == dto.protocol
    assert client.connection_state == dto.connection_state
