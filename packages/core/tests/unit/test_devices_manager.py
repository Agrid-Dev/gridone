import asyncio
import contextlib
from unittest.mock import AsyncMock

import pytest
from core.device import Device, DeviceBase
from core.devices_manager import DevicesManager
from core.driver import Driver, UpdateStrategy


@pytest.fixture
def devices_manager(mock_transport_client, device, driver):
    return DevicesManager(
        devices={"device1": device},
        drivers={"test_driver": driver},
        transports={"t1": mock_transport_client},
    )


class TestDevicesManagerInit:
    def test_init(self):
        manager = DevicesManager(devices={}, drivers={}, transports={})

        assert manager.devices == {}
        assert manager.drivers == {}
        assert manager.transports == {}
        assert manager._running is False
        assert manager._attribute_listeners == []


class TestDevicesManagerPolling:
    @pytest.mark.asyncio
    async def test_start_polling_with_polling_enabled(self, devices_manager, device):
        devices_manager.devices = {"device1": device}

        await devices_manager.start_polling()

        assert devices_manager._running is True
        assert devices_manager.poll_count == 1

    @pytest.mark.asyncio
    async def test_start_polling_without_polling_enabled(
        self,
        device_base: DeviceBase,
        mock_transport_client,
        driver: Driver,
    ):
        driver.update_strategy = UpdateStrategy(polling_enabled=False)

        device_no_poll = Device.from_base(
            device_base,
            driver=driver,
            transport=mock_transport_client,
        )
        manager = DevicesManager(
            devices={"device1": device_no_poll},
            drivers={driver.metadata.id: driver},
            transports={"t1": mock_transport_client},
        )

        await manager.start_polling()

        assert manager.poll_count == 0

    @pytest.mark.asyncio
    async def test_start_polling_multiple_devices(self, mock_transport_client, driver):
        device1 = Device.from_base(
            DeviceBase(id="device1", name="device1", config={}),
            transport=mock_transport_client,
            driver=driver,
        )
        device2 = Device.from_base(
            DeviceBase(id="device2", name="device2", config={}),
            driver=driver,
            transport=mock_transport_client,
        )
        manager = DevicesManager(
            devices={"device1": device1, "device2": device2},
            drivers={"test_driver": driver},
            transports={"t1": mock_transport_client},
        )

        await manager.start_polling()

        assert manager.poll_count == 2

    @pytest.mark.asyncio
    async def test_stop_polling(self, devices_manager, device):
        devices_manager.devices = {"device1": device}
        await devices_manager.start_polling()

        await devices_manager.stop_polling()

        assert devices_manager._running is False
        assert devices_manager.poll_count == 0

    @pytest.mark.asyncio
    async def test_stop_polling_no_tasks(self, devices_manager):
        devices_manager._running = True

        await devices_manager.stop_polling()

        assert devices_manager._running is False

    @pytest.mark.asyncio
    async def test_device_poll_loop(
        self, devices_manager, device, mock_transport_client
    ):
        devices_manager.devices = {"device1": device}
        await devices_manager.start_polling()
        mock_transport_client.read = AsyncMock(return_value="25.5")
        await asyncio.sleep(0.1)
        await devices_manager.stop_polling()
        assert mock_transport_client.read.called

    @pytest.mark.asyncio
    async def test_device_poll_loop_cancelled(self, devices_manager, device):
        devices_manager._running = True

        task = asyncio.create_task(devices_manager._device_poll_loop(device))
        task.cancel()

        with contextlib.suppress(asyncio.CancelledError):
            await task

        assert task.cancelled()


class TestDevicesManagerListeners:
    def test_add_device_attribute_listener(self, devices_manager, device):
        callback_called = False

        def callback(_device_obj, _attribute_name, _attribute) -> None:
            nonlocal callback_called
            callback_called = True

        devices_manager.add_device_attribute_listener(callback)

        assert len(devices_manager._attribute_listeners) == 1
        assert callback in device._update_listeners

    def test_attach_listeners(self, devices_manager):
        callback_called = False

        def callback_spy(_device_obj, _attribute_name, _attribute) -> None:
            nonlocal callback_called
            callback_called = True

        devices_manager.add_device_attribute_listener(callback_spy)

        device = next(iter(devices_manager.devices.values()))
        device._update_attribute(device.attributes["temperature_setpoint"], 22)

        assert callback_called


class TestDevicesManagerDiscovery:
    @pytest.mark.asyncio
    async def test_devices_manager_adds_device_on_discovery(
        self, driver_w_push_transport, mock_push_transport_client
    ):
        driver_id = driver_w_push_transport.id
        transport_id = mock_push_transport_client.id
        dm = DevicesManager(
            devices={},
            drivers={driver_id: driver_w_push_transport},
            transports={transport_id: mock_push_transport_client},
        )
        await dm.register_discovery(driver_id=driver_id, transport_id=transport_id)
        await mock_push_transport_client.simulate_event(
            "/xx",
            {"id": "abc", "gateway_id": "gtw", "payload": {"temperature": 22}},
        )
        assert len(dm.devices) == 1
        device = dm.devices[next(iter(dm.devices.keys()))]
        assert device.config["vendor_id"] == "abc"
        assert device.config["gateway_id"] == "gtw"
        # add only once
        await mock_push_transport_client.simulate_event(
            "/xx",
            {"id": "abc", "gateway_id": "gtw", "payload": {"temperature": 22}},
        )
        assert len(dm.devices) == 1

    @pytest.mark.asyncio
    async def test_devices_manager_does_not_add_existing_device_on_discovery(
        self, driver_w_push_transport, mock_push_transport_client
    ):
        driver_id = driver_w_push_transport.id
        transport_id = mock_push_transport_client.id
        config = {
            "vendor_id": "abc",
            "gateway_id": "gtw",
        }
        device = Device.from_base(
            DeviceBase(id="xyz", name="My device", config=config),
            driver=driver_w_push_transport,
            transport=mock_push_transport_client,
        )
        dm = DevicesManager(
            devices={device.id: device},
            drivers={driver_id: driver_w_push_transport},
            transports={transport_id: mock_push_transport_client},
        )
        assert len(dm.devices) == 1
        await dm.register_discovery(driver_id=driver_id, transport_id=transport_id)
        await mock_push_transport_client.simulate_event(
            "/xx",
            {"id": "abc", "gateway_id": "gtw", "payload": {"temperature": 22}},
        )
        assert len(dm.devices) == 1

    @pytest.mark.asyncio
    async def test_devices_manager_does_not_add_device_if_discovery_unregistered(
        self, driver_w_push_transport, mock_push_transport_client
    ):
        driver_id = driver_w_push_transport.id
        transport_id = mock_push_transport_client.id
        dm = DevicesManager(
            devices={},
            drivers={driver_id: driver_w_push_transport},
            transports={transport_id: mock_push_transport_client},
        )

        await dm.register_discovery(driver_id=driver_id, transport_id=transport_id)
        await dm.unregister_discovery(driver_id=driver_id, transport_id=transport_id)
        await mock_push_transport_client.simulate_event(
            "/xx",
            {"id": "abc", "gateway_id": "gtw", "payload": {"temperature": 22}},
        )
        assert len(dm.devices) == 0
