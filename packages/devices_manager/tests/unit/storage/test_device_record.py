"""The record is storage's private durable projection of a device: identity,
config, tags and attribute state — never the derived type/is_faulty."""

from datetime import UTC, datetime

import pytest

from devices_manager.core.device import Attribute, CoreDevice, DeviceBase
from devices_manager.core.driver import Driver, DriverMetadata, UpdateStrategy
from devices_manager.core.transports import (
    TransportMetadata,
    make_transport_client,
    make_transport_config,
)
from devices_manager.storage.device_record import (
    DeviceRecord,
    base_from_record,
    to_record,
)
from devices_manager.types import DataType, TransportProtocols


@pytest.fixture
def core_device() -> CoreDevice:
    driver = Driver(
        metadata=DriverMetadata(id="drv1"),
        transport=TransportProtocols.HTTP,
        env={},
        device_config_required=[],
        update_strategy=UpdateStrategy(),
        attributes={},
    )
    transport = make_transport_client(
        TransportProtocols.HTTP,
        make_transport_config(TransportProtocols.HTTP, {}),
        TransportMetadata(id="t1", name="T"),
    )
    return CoreDevice(
        id="dev1",
        name="Sensor",
        config={"some_id": "abc"},
        driver=driver,
        transport=transport,
        tags={"floor": "3"},
        attributes={
            "temperature": Attribute.create(
                "temperature", DataType.FLOAT, {"read"}, 22.5
            )
        },
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
        updated_at=datetime(2026, 2, 1, tzinfo=UTC),
    )


class TestRoundTrip:
    def test_snapshot_preserves_identity_state_and_timestamps(self, core_device):
        base = base_from_record(to_record(core_device))
        assert isinstance(base, DeviceBase)
        assert base.id == core_device.id
        assert base.name == core_device.name
        assert base.config == core_device.config
        assert base.driver_id == "drv1"
        assert base.transport_id == "t1"
        assert base.tags == {"floor": "3"}
        assert base.attributes["temperature"].current_value == 22.5
        assert base.created_at == core_device.created_at
        assert base.updated_at == core_device.updated_at


class TestLegacyPayloads:
    def test_legacy_derived_fields_are_ignored(self):
        record = DeviceRecord.model_validate(
            {
                "id": "dev1",
                "driver_id": "drv1",
                "transport_id": "t1",
                "type": "thermostat",
                "is_faulty": True,
                "kind": "physical",
            }
        )
        base = base_from_record(record)
        assert base.id == "dev1"
        assert base.name == ""
        assert base.config == {}
        assert not hasattr(base, "type")
