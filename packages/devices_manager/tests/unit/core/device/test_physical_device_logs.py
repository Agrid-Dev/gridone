"""Tests for event logging on PhysicalDevice (read/write/listen)."""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

import pytest

from devices_manager.core.device.event_log import EventType

if TYPE_CHECKING:
    from devices_manager.core.device import PhysicalDevice

pytestmark = pytest.mark.asyncio


class TestReadLog:
    async def test_successful_read_appends_ok_log(
        self, device: PhysicalDevice, mock_transport_client
    ) -> None:
        mock_transport_client.read = AsyncMock(return_value="25.5")
        await device.read_attribute_value("temperature")
        logs = device.attributes["temperature"].get_logs()
        assert len(logs["read"]) == 1
        assert logs["read"][0].status == "ok"
        assert logs["read"][0].message is None

    async def test_failed_read_appends_error_log(
        self, device: PhysicalDevice, mock_transport_client
    ) -> None:
        mock_transport_client.read = AsyncMock(
            side_effect=OSError("Connection refused")
        )
        with pytest.raises(OSError, match="Connection refused"):
            await device.read_attribute_value("temperature")
        logs = device.attributes["temperature"].get_logs()
        assert len(logs["read"]) == 1
        assert logs["read"][0].status == "error"
        assert logs["read"][0].message is not None
        assert "Connection refused" in logs["read"][0].message

    async def test_multiple_reads_accumulate_logs(
        self, device: PhysicalDevice, mock_transport_client
    ) -> None:
        mock_transport_client.read = AsyncMock(return_value="20.0")
        for _ in range(3):
            await device.read_attribute_value("temperature")
        assert len(device.attributes["temperature"].get_logs()["read"]) == 3

    async def test_unknown_attribute_does_not_log(self, device: PhysicalDevice) -> None:
        with pytest.raises(Exception):  # noqa: B017, PT011
            await device.read_attribute_value("nonexistent")
        assert len(device.attributes["temperature"].get_logs()["read"]) == 0


class TestWriteLog:
    async def test_successful_write_appends_ok_log(
        self, device: PhysicalDevice, mock_transport_client
    ) -> None:
        mock_transport_client.read = AsyncMock(return_value="22.0")
        await device.write_attribute_value("temperature_setpoint", 22.0, confirm=False)
        logs = device.attributes["temperature_setpoint"].get_logs()
        assert len(logs["write"]) == 1
        assert logs["write"][0].status == "ok"

    async def test_failed_write_appends_error_log(
        self, device: PhysicalDevice, mock_transport_client
    ) -> None:
        mock_transport_client.write = AsyncMock(side_effect=OSError("Timeout"))
        with pytest.raises(OSError, match="Timeout"):
            await device.write_attribute_value(
                "temperature_setpoint", 22.0, confirm=False
            )
        logs = device.attributes["temperature_setpoint"].get_logs()
        assert len(logs["write"]) == 1
        assert logs["write"][0].status == "error"
        assert logs["write"][0].message is not None
        assert "Timeout" in logs["write"][0].message


class TestListenLog:
    async def test_successful_listen_appends_ok_log(
        self, push_device: PhysicalDevice, mock_push_transport_client
    ) -> None:
        await push_device.init_listeners()
        # topic from driver: /xx/temperature; codec: json_pointer /payload/temperature
        await mock_push_transport_client.simulate_event(
            "/xx/temperature", {"payload": {"temperature": 25.0}}
        )
        logs = push_device.attributes["temperature"].get_logs()
        assert len(logs["listen"]) == 1
        assert logs["listen"][0].status == "ok"
        assert logs["listen"][0].event_type == EventType.LISTEN

    async def test_failed_listen_appends_error_log(
        self, push_device: PhysicalDevice, mock_push_transport_client
    ) -> None:
        await push_device.init_listeners()
        # Passing a string instead of a dict causes the json_pointer codec to fail
        with pytest.raises(Exception):  # noqa: B017, PT011
            await mock_push_transport_client.simulate_event(
                "/xx/temperature", "not-a-dict"
            )
        logs = push_device.attributes["temperature"].get_logs()
        assert len(logs["listen"]) == 1
        assert logs["listen"][0].status == "error"

    async def test_read_and_write_logs_are_isolated(
        self, device: PhysicalDevice, mock_transport_client
    ) -> None:
        mock_transport_client.read = AsyncMock(return_value="20.0")
        await device.read_attribute_value("temperature")
        logs = device.attributes["temperature"].get_logs()
        assert len(logs["read"]) == 1
        assert len(logs["write"]) == 0
        assert len(logs["listen"]) == 0
