import pytest
from core.transports import (
    BaseTransportConfig,
    TransportClient,
    make_transport_client,
)
from core.transports.bacnet_transport import (
    BacnetTransportClient,
    BacnetTransportConfig,
)
from core.transports.http_transport import HTTPTransportClient, HttpTransportConfig
from core.transports.modbus_tcp_transport import (
    ModbusTCPTransportClient,
    ModbusTCPTransportConfig,
)
from core.transports.mqtt_transport import MqttTransportClient, MqttTransportConfig
from core.types import TransportProtocols


class UnknownTransportConfig(BaseTransportConfig):
    name: str


@pytest.fixture
def invalid_transport_config() -> UnknownTransportConfig:
    return UnknownTransportConfig(name="zitoune")


def test_invalid_transport_config_raises(mock_metadata, invalid_transport_config):
    for protocol in TransportProtocols:
        with pytest.raises(ValueError):  # noqa: PT011
            make_transport_client(protocol, invalid_transport_config, mock_metadata)


def test_mismatched_transport_config_raises(mock_metadata):
    config = HttpTransportConfig()
    with pytest.raises(ValueError):  # noqa: PT011
        make_transport_client(TransportProtocols.MQTT, config, mock_metadata)


@pytest.mark.parametrize(
    ("protocol", "config", "expected_class"),
    (
        [
            (TransportProtocols.HTTP, HttpTransportConfig(), HTTPTransportClient),
            (
                TransportProtocols.MQTT,
                MqttTransportConfig(host="localhost"),
                MqttTransportClient,
            ),
            (
                TransportProtocols.MODBUS_TCP,
                ModbusTCPTransportConfig(host="localhost"),
                ModbusTCPTransportClient,
            ),
            (
                TransportProtocols.BACNET,
                BacnetTransportConfig(ip_with_mask="127.0.0.1/24"),
                BacnetTransportClient,
            ),
        ]
    ),
)
def test_make_transport_client(
    mock_metadata,
    protocol: TransportProtocols,
    config: BaseTransportConfig,
    expected_class: type[TransportClient],
):
    client = make_transport_client(protocol, config, mock_metadata)
    assert isinstance(client, expected_class)
