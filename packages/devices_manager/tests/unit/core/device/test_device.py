from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from devices_manager.core import Driver, TransportClient
from devices_manager.core.codecs.factory import CodecSpec
from devices_manager.core.device import Attribute, DeviceBase, PhysicalDevice
from devices_manager.core.driver import (
    AttributeDriver,
    DriverMetadata,
    UpdateStrategy,
)
from devices_manager.types import DataType, TransportProtocols

from ..fixtures.transport_clients import MockTransportAddress


@pytest.fixture
def device(mock_transport_client, driver) -> PhysicalDevice:
    return PhysicalDevice.from_base(
        DeviceBase(id="d1", name="My pull device", config={"some_id": "abcd"}),
        driver=driver,
        transport=mock_transport_client,
    )


@pytest.fixture
def device_w_push_transport(
    mock_push_transport_client, driver_w_push_transport
) -> PhysicalDevice:
    return PhysicalDevice.from_base(
        DeviceBase(id="d2", name="My push device", config={"some_id": "abcd"}),
        driver=driver_w_push_transport,
        transport=mock_push_transport_client,
    )


class TestDeviceCreation:
    def test_build_protocol_mismatch(
        self, driver_w_push_transport, mock_transport_client
    ):
        with pytest.raises(TypeError):
            _ = PhysicalDevice(
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
        device = PhysicalDevice.from_base(
            DeviceBase(id="d1", name="my device", config={}),
            transport=mock_transport_client,
            driver=driver,
        )
        assert device.id == "d1"
        assert len(device.attributes) == len(driver.attributes)

    def test_initialize_attributes(self, driver, mock_transport_client):
        device = PhysicalDevice.from_base(
            DeviceBase(id="d1", name="My pull device", config={"some_id": "abcd"}),
            driver=driver,
            transport=mock_transport_client,
            initial_values={"temperature": 20},
        )
        assert device.get_attribute_value("temperature") == 20

    def test_type_reflects_driver_type(self, driver, mock_transport_client):
        """Regression: PhysicalDevice.type is a live property from driver.type."""
        device = PhysicalDevice.from_base(
            DeviceBase(id="d1", name="my device", config={}),
            driver=driver,
            transport=mock_transport_client,
        )
        assert device.type == driver.type


class TestDeviceRead:
    @pytest.mark.asyncio
    async def test_read_value_ok(self, device: PhysicalDevice, mock_transport_client):
        mock_transport_client.read = AsyncMock(return_value=23.5)
        value = await device.read_attribute_value("temperature")
        assert value == 23.5
        mock_transport_client.read.assert_called_once()

    @pytest.mark.asyncio
    async def test_read_value_with_context_rendering(
        self, device: PhysicalDevice, mock_transport_client
    ):
        mock_transport_client.read = AsyncMock(return_value=23.5)
        await device.read_attribute_value("temperature_setpoint")
        expected_address = MockTransportAddress(address="GET /abcd/setpoint")
        actual_address = mock_transport_client.read.call_args[0][0]
        assert actual_address.address == expected_address.address

    @pytest.mark.asyncio
    async def test_read_value_with_adapter(
        self, device: PhysicalDevice, mock_transport_client
    ):
        mock_transport_client.read = AsyncMock(
            return_value={"data": {"temperature": 23.5}}
        )
        value = await device.read_attribute_value("temperature_w_adapter")
        assert value == 23.5
        mock_transport_client.read.assert_called_once()

    @pytest.mark.skip
    def test_handle_transport_error(self, device: PhysicalDevice):
        """@TODO: check that a transport error is raised
        if an error occurs in transport"""


class TestDeviceWrite:
    @pytest.mark.asyncio
    async def test_write_value_calls_transport(
        self, device: PhysicalDevice, mock_transport_client
    ):
        mock_transport_client.write = AsyncMock()
        await device.write_attribute_value("temperature_setpoint", 20, confirm=False)
        mock_transport_client.write.assert_called_once()

    @pytest.mark.asyncio
    async def test_write_value_calls_transport_with_context_rendering(
        self, device: PhysicalDevice, mock_transport_client
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
        self, device: PhysicalDevice, mock_transport_client
    ):
        mock_transport_client.write = AsyncMock()
        await device.write_attribute_value(
            "temperature_setpoint_w_reversible_adapter", 20, confirm=False
        )
        args, _ = mock_transport_client.write.call_args  # args: (address, value)
        assert args[1] == 200  # reverse-scaled value

    @pytest.mark.asyncio
    async def test_write_value_with_confirm(
        self, device: PhysicalDevice, mock_transport_client
    ):
        mock_transport_client.write = AsyncMock()
        mock_transport_client.read = AsyncMock(return_value=20)
        await device.write_attribute_value("temperature_setpoint", 20, confirm=True)
        mock_transport_client.write.assert_called_once()
        mock_transport_client.read.assert_called_once()
        assert device.attributes["temperature_setpoint"].current_value == 20

    @pytest.mark.asyncio
    async def test_write_attribute_value_returns_attribute(
        self, device: PhysicalDevice, mock_transport_client
    ):
        mock_transport_client.write = AsyncMock()
        result = await device.write_attribute_value(
            "temperature_setpoint", 20, confirm=False
        )
        assert isinstance(result, Attribute)
        assert result.current_value == 20

    @pytest.mark.asyncio
    async def test_write_value_not_writable(self, device: PhysicalDevice):
        with pytest.raises(PermissionError):
            await device.write_attribute_value("humidity", 12)


class TestDevicesListeners:
    @pytest.mark.asyncio
    async def test_devices_updates_on_listen(
        self, device_w_push_transport: PhysicalDevice, mock_push_transport_client
    ):
        assert device_w_push_transport.attributes["temperature"].current_value is None
        await device_w_push_transport.init_listeners()
        # Simulate transport reading a value
        await mock_push_transport_client.simulate_event(
            "/xx/temperature", {"payload": {"temperature": 25}}
        )
        assert device_w_push_transport.attributes["temperature"].current_value == 25

    @pytest.mark.asyncio
    async def test_listeners_update_their_own_attribute(
        self, mock_push_transport_client
    ):
        """Regression: each listener must update its own attribute, not the last one."""

        driver = Driver(
            metadata=DriverMetadata(id="multi_attr_push"),
            env={},
            device_config_required=[],
            transport=TransportProtocols.MQTT,
            update_strategy=UpdateStrategy(),
            attributes={
                "temperature": AttributeDriver(
                    name="temperature",
                    data_type=DataType.FLOAT,
                    read={"topic": "/dev/temperature"},
                    write=None,
                    codec_specs=[
                        CodecSpec(name="json_pointer", argument="/payload/temperature")
                    ],
                ),
                "humidity": AttributeDriver(
                    name="humidity",
                    data_type=DataType.FLOAT,
                    read={"topic": "/dev/humidity"},
                    write=None,
                    codec_specs=[
                        CodecSpec(name="json_pointer", argument="/payload/humidity")
                    ],
                ),
            },
        )
        device = PhysicalDevice.from_base(
            DeviceBase(id="d3", name="Multi-attr push device", config={}),
            driver=driver,
            transport=mock_push_transport_client,
        )
        await device.init_listeners()

        await mock_push_transport_client.simulate_event(
            "/dev/temperature", {"payload": {"temperature": 22.5}}
        )
        await mock_push_transport_client.simulate_event(
            "/dev/humidity", {"payload": {"humidity": 65.0}}
        )

        assert device.attributes["temperature"].current_value == 22.5
        assert device.attributes["humidity"].current_value == 65.0


class TestCoreDeviceCanWrite:
    def test_writable_attribute_returns_true(self, device: PhysicalDevice):
        assert device.can_write("temperature_setpoint") is True

    def test_read_only_attribute_returns_false(self, device: PhysicalDevice):
        assert device.can_write("temperature") is False

    def test_unknown_attribute_returns_false(self, device: PhysicalDevice):
        assert device.can_write("nonexistent") is False

    def test_writable_with_matching_data_type(self, device: PhysicalDevice):
        assert (
            device.can_write("temperature_setpoint", data_type=DataType.FLOAT) is True
        )

    def test_writable_with_mismatched_data_type(self, device: PhysicalDevice):
        assert (
            device.can_write("temperature_setpoint", data_type=DataType.BOOL) is False
        )

    def test_data_type_ignored_when_none(self, device: PhysicalDevice):
        assert device.can_write("temperature_setpoint", data_type=None) is True


class TestDeviceEquality:
    def test_device_equals_to_itself(self, device: PhysicalDevice):
        assert device == device  # noqa: PLR0124

    def test_device_equals_same_configs(self, mock_transport_client, driver):
        device_1 = PhysicalDevice.from_base(
            DeviceBase(id="xxx", name="My device", config={"some_id": "abcd"}),
            driver=driver,
            transport=mock_transport_client,
        )
        device_2 = PhysicalDevice.from_base(
            DeviceBase(id="xxx", name="My device", config={"some_id": "abcd"}),
            driver=driver,
            transport=mock_transport_client,
        )
        assert device_1 == device_2

    def test_device_not_equals_different_configs(self, mock_transport_client, driver):
        device_1 = PhysicalDevice.from_base(
            DeviceBase(id="xxx", name="My device", config={"some_id": "abcd"}),
            driver=driver,
            transport=mock_transport_client,
        )
        device_2 = PhysicalDevice.from_base(
            DeviceBase(id="xxx", name="My device", config={"some_id": "xyz"}),
            driver=driver,
            transport=mock_transport_client,
        )
        assert device_1 != device_2
