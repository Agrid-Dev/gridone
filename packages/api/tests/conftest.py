from pathlib import Path

import pytest
from core.driver import AttributeDriver, Driver, DriverMetadata, UpdateStrategy
from core.transports import TransportClient, TransportMetadata
from core.transports.http_transport import HTTPTransportClient, HttpTransportConfig
from core.transports.mqtt_transport import MqttTransportClient, MqttTransportConfig
from core.types import DataType, TransportProtocols
from core.value_adapters import ValueAdapterSpec
from dto.driver_dto import core_to_dto as driver_to_dto
from dto.transport_dto import core_to_dto as transport_to_dto
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
def attributes() -> list[AttributeDriver]:
    return [
        AttributeDriver(
            name="temperature",
            data_type=DataType.FLOAT,
            read="GET /temperature",
            write=None,
            value_adapter_specs=[ValueAdapterSpec(adapter="identity", argument="")],
        ),
        AttributeDriver(
            name="temperature_setpoint",
            data_type=DataType.FLOAT,
            read="GET /${some_id}/setpoint",
            write="POST /${some_id}/setpoint",
            value_adapter_specs=[ValueAdapterSpec(adapter="identity", argument="")],
        ),
    ]


@pytest.fixture
def mock_drivers(attributes: list[AttributeDriver]) -> dict[str, Driver]:
    driver = Driver(
        metadata=DriverMetadata(id="test_driver"),
        env={"base_url": "http://example.com"},
        transport=TransportProtocols.HTTP,
        device_config_required=[],
        update_strategy=UpdateStrategy(),
        attributes={attribute.name: attribute for attribute in attributes},
    )
    return {driver.metadata.id: driver}


@pytest.fixture
def mock_repository(
    tmp_path: Path,
    mock_transports: dict[str, TransportClient],
    mock_drivers: dict[str, Driver],
) -> CoreFileStorage:
    cfs = CoreFileStorage(tmp_path)
    for transport_id, tc in mock_transports.items():
        cfs.transports.write(transport_id, transport_to_dto(tc).model_dump(mode="json"))
    for driver_id, driver in mock_drivers.items():
        cfs.drivers.write(driver_id, driver_to_dto(driver).model_dump(mode="json"))
    return cfs
