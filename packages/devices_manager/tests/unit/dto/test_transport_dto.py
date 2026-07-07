import pytest

from devices_manager.core.transports import TransportConnectionState, TransportMetadata
from devices_manager.core.transports.http_transport import (
    HTTPTransportClient,
    HttpTransportConfig,
)
from devices_manager.core.transports.mqtt_transport import (
    MqttTransportClient,
    MqttTransportConfig,
)
from devices_manager.dto.transport_dto import (
    HttpTransportRead,
    MqttTransport,
    MqttTransportConfigRead,
    MqttTransportRead,
    core_to_dto,
    dto_to_core,
    mask_transport,
)
from devices_manager.types import TransportProtocols


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
    dto = MqttTransport(
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


class TestMaskTransport:
    def test_masks_secret_fields_and_sets_is_set_flags(self, mock_metadata):
        dto = MqttTransport(
            id=mock_metadata.id,
            name=mock_metadata.name,
            protocol=TransportProtocols.MQTT,
            config=MqttTransportConfig(
                host="broker",
                client_key="shh",
            ),
            connection_state=TransportConnectionState.idle(),
        )
        read = mask_transport(dto)
        assert isinstance(read, MqttTransportRead)
        assert read.config.client_key is None
        assert read.config.client_key_is_set is True
        assert read.config.password is None
        assert read.config.password_is_set is False

    def test_non_secret_fields_pass_through_unmasked(self, mock_metadata):
        dto = MqttTransport(
            id=mock_metadata.id,
            name=mock_metadata.name,
            protocol=TransportProtocols.MQTT,
            config=MqttTransportConfig(host="broker", port=8883),
            connection_state=TransportConnectionState.idle(),
        )
        read = mask_transport(dto)
        assert isinstance(read, MqttTransportRead)
        assert read.config.host == "broker"
        assert read.config.port == 8883

    def test_protocol_with_no_secret_fields_is_returned_as_is(self, mock_metadata):
        client = HTTPTransportClient(
            config=HttpTransportConfig(), metadata=mock_metadata
        )
        dto = core_to_dto(client)
        read = mask_transport(dto)
        assert isinstance(read, HttpTransportRead)
        assert read.config == dto.config

    def test_masked_config_declares_an_is_set_flag_for_every_secret_field(self):
        """Guards against MqttTransportConfig gaining a secret field silently

        unmasked: MqttTransportConfigRead must declare a matching `_is_set`
        flag for every field MqttTransportConfig.secret_field_names() reports.
        """
        expected = {
            f"{name}_is_set" for name in MqttTransportConfig.secret_field_names()
        }
        assert expected <= set(MqttTransportConfigRead.model_fields)
