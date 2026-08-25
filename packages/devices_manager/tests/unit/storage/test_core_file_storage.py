from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

import pytest

from devices_manager.core.device import Attribute
from devices_manager.core.transports import (
    TransportConnectionState,
    TransportMetadata,
    make_transport_client,
    make_transport_config,
)
from devices_manager.dto import Device
from devices_manager.storage.yaml.core_file_storage import CoreFileStorage
from devices_manager.types import (
    ConnectionStatus,
    DataType,
    TransportProtocols,
)

if TYPE_CHECKING:
    from pathlib import Path

    from devices_manager.core.transports import TransportClient


def _make_device(
    device_id: str = "dev1",
    attributes: dict[str, Attribute] | None = None,
) -> Device:
    return Device(
        id=device_id,
        name="Test Device",
        type="sensor",
        config={},
        driver_id="d1",
        transport_id="t1",
        attributes=attributes or {},
        is_faulty=False,
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


def _make_client(transport_id: str = "t1") -> TransportClient:
    return make_transport_client(
        TransportProtocols.HTTP,
        make_transport_config(TransportProtocols.HTTP, {"request_timeout": 5}),
        TransportMetadata(id=transport_id, name="HTTP"),
    )


class TestTransportRoundTrip:
    @pytest.mark.asyncio
    async def test_round_trip_preserves_identity_and_config(
        self, storage: CoreFileStorage
    ):
        client = _make_client()
        await storage.transports.write("t1", client)

        result = await storage.transports.read("t1")
        assert result.id == client.id
        assert result.metadata.name == client.metadata.name
        assert result.config == client.config
        assert result.metadata.created_at == client.metadata.created_at
        assert result.metadata.updated_at == client.metadata.updated_at

    @pytest.mark.asyncio
    async def test_connected_client_hydrates_idle(self, storage: CoreFileStorage):
        client = _make_client("t2")
        client.connection_state = TransportConnectionState.connected()
        await storage.transports.write("t2", client)

        result = await storage.transports.read("t2")
        assert result.connection_state.status == ConnectionStatus.IDLE

    @pytest.mark.asyncio
    async def test_legacy_file_with_connection_state_still_loads(
        self, storage: CoreFileStorage, tmp_path: Path
    ):
        (tmp_path / "transports" / "t3.yaml").write_text(
            "id: t3\n"
            "name: Legacy\n"
            "protocol: http\n"
            "config: {}\n"
            "connection_state:\n"
            "  status: ok\n",
            encoding="utf-8",
        )

        result = await storage.transports.read("t3")
        assert result.id == "t3"
        assert result.connection_state.status == ConnectionStatus.IDLE


class TestTagMutations:
    @pytest.mark.asyncio
    async def test_set_tag(self, storage: CoreFileStorage):
        await storage.devices.write("dev1", _make_device())
        await storage.devices.set_tag("dev1", "floor", "3", datetime.now(UTC))

        result = await storage.devices.read("dev1")
        assert result.tags["floor"] == "3"

    @pytest.mark.asyncio
    async def test_delete_tag(self, storage: CoreFileStorage):
        await storage.devices.write("dev1", _make_device())
        await storage.devices.set_tag("dev1", "floor", "3", datetime.now(UTC))
        await storage.devices.delete_tag("dev1", "floor", datetime.now(UTC))

        result = await storage.devices.read("dev1")
        assert "floor" not in result.tags
