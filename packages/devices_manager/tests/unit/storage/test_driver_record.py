"""The record is storage's private durable projection of a driver."""

from datetime import UTC, datetime

import pytest

from devices_manager.core.driver import (
    Driver,
    DriverMetadata,
    FaultAttributeDriver,
    UpdateStrategy,
)
from devices_manager.core.driver.attribute_driver import AttributeDriver
from devices_manager.storage.driver_record import (
    DriverRecord,
    from_record,
    to_record,
)
from devices_manager.types import DataType, TransportProtocols


@pytest.fixture
def core_driver():
    return Driver(
        metadata=DriverMetadata(
            id="d1",
            vendor="acme",
            model="thermostat-v2",
            version=3,
            created_at=datetime(2026, 1, 1, tzinfo=UTC),
            updated_at=datetime(2026, 2, 1, tzinfo=UTC),
        ),
        transport=TransportProtocols.HTTP,
        env={"base_url": "http://example.com"},
        device_config_required=[],
        update_strategy=UpdateStrategy(polling_interval=30),
        attributes={
            "temperature": AttributeDriver(
                name="temperature",
                data_type=DataType.FLOAT,
                read="GET /temperature",
                codecs=[],
            ),
            "alarm": FaultAttributeDriver(  # ty: ignore[missing-argument]
                name="alarm",
                data_type=DataType.BOOL,
                read="GET /alarm",
                codecs=[],
            ),
        },
        type=None,
    )


class TestRoundTrip:
    def test_preserves_identity_config_and_timestamps(self, core_driver):
        result = from_record(to_record(core_driver))
        assert result.id == core_driver.id
        assert result.metadata.vendor == "acme"
        assert result.metadata.model == "thermostat-v2"
        assert result.metadata.version == 3
        assert result.transport == core_driver.transport
        assert result.env == core_driver.env
        assert result.update_strategy == core_driver.update_strategy
        assert result.attributes == core_driver.attributes
        assert result.metadata.created_at == core_driver.metadata.created_at
        assert result.metadata.updated_at == core_driver.metadata.updated_at

    def test_attribute_kinds_survive_round_trip(self, core_driver):
        result = from_record(to_record(core_driver))
        assert type(result.attributes["temperature"]) is AttributeDriver
        assert type(result.attributes["alarm"]) is FaultAttributeDriver


class TestLegacyPayloads:
    def test_minimal_payload_uses_defaults(self):
        record = DriverRecord.model_validate(
            {
                "id": "d1",
                "transport": "http",
                "attributes": [
                    {
                        "name": "temperature",
                        "data_type": "float",
                        "read": "GET /temperature",
                    }
                ],
            }
        )
        driver = from_record(record)
        assert driver.id == "d1"
        assert driver.env == {}
        assert driver.update_strategy == UpdateStrategy()
        assert "temperature" in driver.attributes
