from unittest.mock import AsyncMock

import pytest
from core.device import Device

from .fixtures.transport_clients import MockTransportAddress


@pytest.fixture
def device(mock_transport_client, driver) -> Device:
    return Device.from_driver(
        driver, mock_transport_client, {"some_id": "abcd"}, device_id="d1"
    )


@pytest.fixture
def device_w_push_transport(
    mock_push_transport_client, driver_w_push_transport
) -> Device:
    return Device.from_driver(
        driver_w_push_transport,
        mock_push_transport_client,
        {"some_id": "abcd"},
        device_id="d2",
    )


class TestDeviceCreation:
    def test_build_from_driver(self, device: Device):
        assert device.id == "d1"
        assert len(device.attributes) == 5

    def test_build_from_driver_protocol_mismatch(
        self, driver_w_push_transport, mock_transport_client
    ):
        with pytest.raises(TypeError):
            Device.from_driver(
                driver_w_push_transport, mock_transport_client, {}, device_id="dd"
            )


class TestDeviceRead:
    @pytest.mark.asyncio
    async def test_read_value_ok(self, device: Device, mock_transport_client):
        mock_transport_client.read = AsyncMock(return_value=23.5)
        value = await device.read_attribute_value("temperature")
        assert value == 23.5
        mock_transport_client.read.assert_called_once()

    @pytest.mark.asyncio
    async def test_read_value_with_context_rendering(
        self, device: Device, mock_transport_client
    ):
        mock_transport_client.read = AsyncMock(return_value=23.5)
        await device.read_attribute_value("temperature_setpoint")
        expected_address = MockTransportAddress(address="GET /abcd/setpoint")
        actual_address = mock_transport_client.read.call_args[0][0]
        assert actual_address.address == expected_address.address

    @pytest.mark.asyncio
    async def test_read_value_with_adapter(self, device: Device, mock_transport_client):
        mock_transport_client.read = AsyncMock(
            return_value={"data": {"temperature": 23.5}}
        )
        value = await device.read_attribute_value("temperature_w_adapter")
        assert value == 23.5
        mock_transport_client.read.assert_called_once()

    @pytest.mark.skip
    def test_handle_transport_error(self, device: Device):
        """@TODO: check that a transport error is raised
        if an error occurs in transport"""


class TestDeviceWrite:
    @pytest.mark.asyncio
    async def test_write_value_calls_transport(
        self, device: Device, mock_transport_client
    ):
        mock_transport_client.write = AsyncMock()
        await device.write_attribute_value("temperature_setpoint", 20, confirm=False)
        mock_transport_client.write.assert_called_once()

    @pytest.mark.asyncio
    async def test_write_value_calls_transport_with_context_rendering(
        self, device: Device, mock_transport_client
    ):
        mock_transport_client.write = AsyncMock()
        await device.write_attribute_value("temperature_setpoint", 20, confirm=False)
        expected_address = MockTransportAddress(address="POST /abcd/setpoint")
        assert mock_transport_client.write.call_args is not None
        args, _ = mock_transport_client.write.call_args  # args: (address, value)
        assert args[0].address == expected_address.address
        assert args[1] == 20

    @pytest.mark.asyncio
    async def test_write_value_calls_transport_with_adapter(
        self, device: Device, mock_transport_client
    ):
        mock_transport_client.write = AsyncMock()
        await device.write_attribute_value(
            "temperature_setpoint_w_reversible_adapter", 20, confirm=False
        )
        args, _ = mock_transport_client.write.call_args  # args: (address, value)
        assert args[1] == 200  # reverse-scaled value

    @pytest.mark.asyncio
    async def test_write_value_with_confirm(
        self, device: Device, mock_transport_client
    ):
        mock_transport_client.write = AsyncMock()
        mock_transport_client.read = AsyncMock(return_value=20)
        await device.write_attribute_value("temperature_setpoint", 20, confirm=True)
        mock_transport_client.write.assert_called_once()
        mock_transport_client.read.assert_called_once()
        assert device.attributes["temperature_setpoint"].current_value == 20

    @pytest.mark.asyncio
    async def test_write_value_not_writable(self, device: Device):
        with pytest.raises(PermissionError):
            await device.write_attribute_value("humidity", 12)


class TestDevicesListeners:
    @pytest.mark.asyncio
    async def test_devices_updates_on_listen(
        self, device_w_push_transport: Device, mock_push_transport_client
    ):
        assert device_w_push_transport.attributes["temperature"].current_value is None
        await device_w_push_transport.init_listeners()
        # Simulate transport reading a value
        await mock_push_transport_client.simulate_event(
            "/xx/temperature", {"payload": {"temperature": 25}}
        )
        assert device_w_push_transport.attributes["temperature"].current_value == 25
