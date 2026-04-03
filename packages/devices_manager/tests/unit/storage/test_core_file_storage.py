from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from devices_manager.core.device import Attribute
from devices_manager.dto import DeviceDTO
from devices_manager.storage.yaml.core_file_storage import CoreFileStorage
from devices_manager.types import DataType, DeviceKind

if TYPE_CHECKING:
    from pathlib import Path


def _make_device(
    device_id: str = "dev1",
    attributes: dict[str, Attribute] | None = None,
) -> DeviceDTO:
    return DeviceDTO(
        id=device_id,
        kind=DeviceKind.VIRTUAL,
        name="Test Device",
        type="sensor",
        attributes=attributes or {},
    )


@pytest.fixture
def storage(tmp_path: Path) -> CoreFileStorage:
    return CoreFileStorage(tmp_path)


class TestSaveAttribute:
    @pytest.mark.asyncio
    async def test_save_attribute_creates_new(self, storage: CoreFileStorage):
        device = _make_device()
        await storage.devices.write(device.id, device)

        attr = Attribute.create("temp", DataType.FLOAT, {"read"}, 22.5)
        await storage.save_attribute("dev1", attr)

        result = await storage.devices.read("dev1")
        assert "temp" in result.attributes
        assert result.attributes["temp"].current_value == 22.5

    @pytest.mark.asyncio
    async def test_save_attribute_updates_existing(self, storage: CoreFileStorage):
        attrs = {"temp": Attribute.create("temp", DataType.FLOAT, {"read"}, 20.0)}
        await storage.devices.write("dev1", _make_device(attributes=attrs))

        updated = Attribute.create("temp", DataType.FLOAT, {"read"}, 25.0)
        await storage.save_attribute("dev1", updated)

        result = await storage.devices.read("dev1")
        assert result.attributes["temp"].current_value == 25.0

    @pytest.mark.asyncio
    async def test_save_attribute_preserves_other_attributes(
        self, storage: CoreFileStorage
    ):
        attrs = {
            "temp": Attribute.create("temp", DataType.FLOAT, {"read"}, 20.0),
            "humidity": Attribute.create("humidity", DataType.FLOAT, {"read"}, 55.0),
        }
        await storage.devices.write("dev1", _make_device(attributes=attrs))

        updated = Attribute.create("temp", DataType.FLOAT, {"read"}, 25.0)
        await storage.save_attribute("dev1", updated)

        result = await storage.devices.read("dev1")
        assert result.attributes["temp"].current_value == 25.0
        assert result.attributes["humidity"].current_value == 55.0

    @pytest.mark.asyncio
    async def test_save_attribute_unknown_device_logs_warning(
        self, storage: CoreFileStorage, caplog
    ):
        attr = Attribute.create("temp", DataType.FLOAT, {"read"}, 22.5)
        await storage.save_attribute("nonexistent", attr)
        assert "Cannot persist attribute for unknown device" in caplog.text
