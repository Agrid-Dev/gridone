import pytest

from devices_manager.core.transports import (
    BaseTransportConfig,
    TransportClient,
    make_transport_client,
)
from devices_manager.core.transports.bacnet_transport import (
    BacnetTransportClient,
    BacnetTransportConfig,
)
from devices_manager.core.transports.http_transport import (
    HTTPTransportClient,
    HttpTransportConfig,
)
from devices_manager.core.transports.knx_transport import (
    KNXTransportClient,
    KNXTransportConfig,
)
from devices_manager.core.transports.mbus_transport import (
    MBusTransportClient,
    MBusTransportConfig,
)
from devices_manager.core.transports.modbus_tcp_transport import (
    ModbusTCPTransportClient,
    ModbusTCPTransportConfig,
)
from devices_manager.core.transports.mqtt_transport import (
    MqttTransportClient,
    MqttTransportConfig,
)
from devices_manager.types import TransportProtocols


class UnknownTransportConfig(BaseTransportConfig):
    name: str


@pytest.fixture
def invalid_transport_config() -> UnknownTransportConfig:
    return UnknownTransportConfig(name="zitoune")


def test_invalid_transport_config_raises(
    mock_transport_metadata, invalid_transport_config
):
    for protocol in TransportProtocols:
        with pytest.raises(TypeError):
            make_transport_client(
                protocol, invalid_transport_config, mock_transport_metadata
            )


def test_mismatched_transport_config_raises(mock_transport_metadata):
    config = HttpTransportConfig()
    with pytest.raises(TypeError):
        make_transport_client(TransportProtocols.MQTT, config, mock_transport_metadata)


@pytest.mark.parametrize(
    ("protocol", "config", "expected_class", "expected_serialize_reads"),
    (
        [
            (
                TransportProtocols.HTTP,
                HttpTransportConfig(),
                HTTPTransportClient,
                False,
            ),
            (
                TransportProtocols.MQTT,
                MqttTransportConfig(host="localhost"),
                MqttTransportClient,
                False,
            ),
            (
                TransportProtocols.MODBUS_TCP,
                ModbusTCPTransportConfig(host="localhost"),
                ModbusTCPTransportClient,
                True,
            ),
            (
                TransportProtocols.MBUS,
                MBusTransportConfig(host="localhost", port=10001),
                MBusTransportClient,
                True,
            ),
            (
                TransportProtocols.BACNET,
                BacnetTransportConfig(ip_with_mask="127.0.0.1/24"),
                BacnetTransportClient,
                True,
            ),
            (
                TransportProtocols.KNX,
                KNXTransportConfig(gateway_ip="localhost"),
                KNXTransportClient,
                True,
            ),
        ]
    ),
)
def test_make_transport_client(
    mock_transport_metadata,
    protocol: TransportProtocols,
    config: BaseTransportConfig,
    expected_class: type[TransportClient],
    expected_serialize_reads: bool,
):
    client = make_transport_client(protocol, config, mock_transport_metadata)
    assert isinstance(client, expected_class)
    assert client._serialize_reads is expected_serialize_reads  # noqa: SLF001
