import pytest
from core.transports import TransportClient, TransportMetadata
from core.transports.http_transport import HTTPTransportClient, HttpTransportConfig
from core.transports.mqtt_transport import MqttTransportClient, MqttTransportConfig

http_transport = HTTPTransportClient(
    metadata=TransportMetadata(id="my-http", name="My Http client"),
    config=HttpTransportConfig(),
)

mqtt_transport = MqttTransportClient(
    metadata=TransportMetadata(id="my-mqtt", name="My mqtt broker"),
    config=MqttTransportConfig(host="localhost"),
)


@pytest.fixture
def mock_transports() -> dict[str, TransportClient]:
    return {tc.metadata.id: tc for tc in [http_transport, mqtt_transport]}
