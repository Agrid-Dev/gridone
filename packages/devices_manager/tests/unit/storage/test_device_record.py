"""The record is storage's private durable projection of a device: identity,
config, tags and attribute state — never the derived type/is_faulty."""

import asyncio
from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest
from pydantic import ValidationError

from devices_manager.core.device import Attribute, CoreDevice, DeviceBase
from devices_manager.core.driver import Driver, DriverMetadata, UpdateStrategy
from devices_manager.core.transports import (
    TransportMetadata,
    make_transport_client,
    make_transport_config,
)
from devices_manager.storage.device_record import (
    DeviceRecord,
    RecordDeviceStorage,
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
        tags={"floor": ["3"]},
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
        assert base.tags == {"floor": ["3"]}
        assert base.attributes["temperature"].current_value == 22.5
        assert base.created_at == core_device.created_at
        assert base.updated_at == core_device.updated_at


class TestLegacyPayloads:
    @pytest.mark.parametrize("tags", [None, [], "floor:3"])
    def test_malformed_tags_raise_a_validation_error(self, tags):
        with pytest.raises(ValidationError, match="tags"):
            DeviceRecord.model_validate(
                {
                    "id": "dev1",
                    "driver_id": "drv1",
                    "transport_id": "t1",
                    "tags": tags,
                }
            )

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


@pytest.mark.asyncio
@pytest.mark.parametrize("values", [["2", "3"], []])
async def test_tag_mutation_and_attribute_polling_preserve_each_others_changes(
    core_device, values
):
    record = to_record(core_device)

    async def read_record(_device_id: str) -> DeviceRecord:
        snapshot = record.model_copy(deep=True)
        # A file read yields to background polling before its mutation is saved.
        await asyncio.sleep(0)
        return snapshot

    async def write_record(_device_id: str, updated: DeviceRecord) -> None:
        nonlocal record
        record = updated

    records = AsyncMock(read=AsyncMock(side_effect=read_record))
    records.write.side_effect = write_record
    storage = RecordDeviceStorage(records)
    timestamp = datetime.now(UTC)
    attribute = Attribute.create("temperature", DataType.FLOAT, {"read"}, 25.0)

    await asyncio.gather(
        storage.set_tag(core_device.id, "floor", values, timestamp),
        storage.save_attribute(core_device.id, attribute),
    )

    assert record.tags == ({"floor": values} if values else {})
    assert record.updated_at == timestamp
    assert record.attributes["temperature"].current_value == 25.0
