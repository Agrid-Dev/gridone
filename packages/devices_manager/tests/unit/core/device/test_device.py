from unittest.mock import AsyncMock

import pytest
from devices_manager import Driver, TransportClient
from devices_manager.core.device import Device, DeviceBase

from ..fixtures.transport_clients import MockTransportAddress


@pytest.fixture
def device(mock_transport_client, driver) -> Device:
    base = DeviceBase(
        id="d1",
        name="My pull device",
        config={"some_id": "abcd"},
    )
    return Device.from_base(
        base,
        driver=driver,
        transport=mock_transport_client,
    )


@pytest.fixture
def device_w_push_transport(
    mock_push_transport_client, driver_w_push_transport
) -> Device:
    base = DeviceBase(id="d2", name="My push device", config={"some_id": "abcd"})
    return Device.from_base(
        base,
        driver=driver_w_push_transport,
        transport=mock_push_transport_client,
    )


class TestDeviceCreation:
    def test_build_protocol_mismatch(
        self, driver_w_push_transport, mock_transport_client
    ):
        with pytest.raises(TypeError):
            _ = Device(
                id="some_id",
                name="name",
                config={},
                driver=driver_w_push_transport,
                transport=mock_transport_client,
                attributes={},
            )

    def test_build_from_raw_raw(
        self, driver: Driver, mock_transport_client: TransportClient
    ):
        base = DeviceBase(
            id="d1",
            name="my device",
            config={},
        )
        device = Device.from_base(
            base,
            transport=mock_transport_client,
            driver=driver,
        )
        assert device.id == "d1"
        assert len(device.attributes) == len(driver.attributes)

    def test_initialize_attributes(self, driver, mock_transport_client):
        base = DeviceBase(
            id="d1",
            name="My pull device",
            config={"some_id": "abcd"},
        )
        device = Device.from_base(
            base,
            driver=driver,
            transport=mock_transport_client,
            initial_values={"temperature": 20},
        )
        assert device.get_attribute_value("temperature") == 20


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


class TestDeviceEquality:
    def test_device_equals_to_itself(self, device: Device):
        assert device == device  # noqa: PLR0124

    def test_device_equals_same_configs(self, mock_transport_client, driver):
        base_1 = DeviceBase(
            id="xxx",
            name="My device",
            config={"some_id": "abcd"},
        )
        base_2 = DeviceBase(
            id="xxx",
            name="My device",
            config={"some_id": "abcd"},
        )
        device_1 = Device.from_base(
            base_1, driver=driver, transport=mock_transport_client
        )
        device_2 = Device.from_base(
            base_2, driver=driver, transport=mock_transport_client
        )
        assert device_1 == device_2

    def test_device_not_equals_different_configs(self, mock_transport_client, driver):
        base_1 = DeviceBase(
            id="xxx",
            name="My device",
            config={"some_id": "abcd"},
        )
        base_2 = DeviceBase(
            id="xxx",
            name="My device",
            config={"some_id": "xyz"},
        )
        device_1 = Device.from_base(
            base_1, driver=driver, transport=mock_transport_client
        )
        device_2 = Device.from_base(
            base_2, driver=driver, transport=mock_transport_client
        )
        assert device_1 != device_2
