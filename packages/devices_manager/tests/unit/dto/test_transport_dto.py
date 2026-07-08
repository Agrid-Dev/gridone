import pytest
from pydantic import TypeAdapter, ValidationError

from devices_manager.core.transports import TransportConnectionState, TransportMetadata
from devices_manager.core.transports.http_transport import (
    HTTPTransportClient,
    HttpTransportConfig,
)
from devices_manager.core.transports.modbus_tcp_transport import (
    ModbusTCPTransportConfig,
)
from devices_manager.core.transports.mqtt_transport import (
    MqttTransportClient,
    MqttTransportConfig,
)
from devices_manager.dto.transport_dto import (
    ModbusTcpTransportCreate,
    MqttTransport,
    TransportCreate,
    TransportUpdate,
    core_to_dto,
    dto_to_core,
)
from devices_manager.types import TransportProtocols

TRANSPORT_CREATE = TypeAdapter(TransportCreate)


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


class TestTransportCreate:
    def test_protocol_narrows_config(self):
        create = TRANSPORT_CREATE.validate_python(
            {
                "name": "PLC",
                "protocol": "modbus-tcp",
                "config": {"host": "plc.local", "port": 1502},
            }
        )
        assert isinstance(create, ModbusTcpTransportCreate)
        assert create.config == ModbusTCPTransportConfig(host="plc.local", port=1502)

    def test_rejects_config_not_matching_protocol(self):
        with pytest.raises(ValidationError, match="host"):
            TRANSPORT_CREATE.validate_python(
                {"name": "PLC", "protocol": "modbus-tcp", "config": {}}
            )

    def test_rejects_unknown_protocol(self):
        with pytest.raises(ValidationError, match="protocol"):
            TRANSPORT_CREATE.validate_python(
                {"name": "Bad", "protocol": "unknown", "config": {}}
            )


class TestTransportUpdate:
    def test_config_kept_as_partial_mapping(self):
        # PATCH has no protocol to discriminate on, so the config is kept as a
        # raw mapping and validated against the transport's own config class
        # when applied (see test_base_transport / update_config).
        update = TransportUpdate.model_validate({"config": {"request_timeout": 5}})
        assert update.config == {"request_timeout": 5}

    def test_partial_config_is_accepted(self):
        # Regression (AGR-901): a partial patch that is not a valid standalone
        # config for any protocol (only `ca_cert`) must still be accepted here.
        update = TransportUpdate.model_validate({"config": {"ca_cert": "cert"}})
        assert update.config == {"ca_cert": "cert"}
