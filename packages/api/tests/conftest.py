from pathlib import Path

import pytest
from core.transports import TransportClient, TransportMetadata
from core.transports.http_transport import HTTPTransportClient, HttpTransportConfig
from core.transports.mqtt_transport import MqttTransportClient, MqttTransportConfig
from dto.transport import core_to_dto
from storage import CoreFileStorage


@pytest.fixture
def mock_transports() -> dict[str, TransportClient]:
    http_transport = HTTPTransportClient(
        metadata=TransportMetadata(id="my-http", name="My Http client"),
        config=HttpTransportConfig(),
    )

    mqtt_transport = MqttTransportClient(
        metadata=TransportMetadata(id="my-mqtt", name="My mqtt broker"),
        config=MqttTransportConfig(host="localhost"),
    )

    return {tc.metadata.id: tc for tc in [http_transport, mqtt_transport]}


@pytest.fixture
def mock_repository(
    tmp_path: Path, mock_transports: dict[str, TransportClient]
) -> CoreFileStorage:
    cfs = CoreFileStorage(tmp_path)
    for tc in mock_transports.values():
        cfs.transports.write(tc.metadata.id, core_to_dto(tc).model_dump(mode="json"))
    return cfs
