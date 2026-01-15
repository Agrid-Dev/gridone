import asyncio
import contextlib
from unittest.mock import AsyncMock

import pytest
from core.device import Device
from core.devices_manager import DeviceRaw, DevicesManager
from core.driver import Driver, UpdateStrategy


@pytest.fixture
def device(driver, mock_transport_client):
    return Device.from_driver(
        driver, mock_transport_client, {"device_id": "device1"}, device_id="device1"
    )


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
        assert manager._background_tasks == set()
        assert manager._running is False
        assert manager._attribute_listeners == []


class TestDevicesManagerPolling:
    @pytest.mark.asyncio
    async def test_start_polling_with_polling_enabled(self, devices_manager, device):
        devices_manager.devices = {"device1": device}

        await devices_manager.start_polling()

        assert devices_manager._running is True
        assert len(devices_manager._background_tasks) == 1

    @pytest.mark.asyncio
    async def test_start_polling_without_polling_enabled(
        self,
        mock_transport_client,
        driver: Driver,
    ):
        driver.update_strategy = UpdateStrategy(polling_enabled=False)

        device_no_poll = Device.from_driver(
            driver,
            mock_transport_client,
            {"device_id": "device1"},
            device_id="device1",
        )
        manager = DevicesManager(
            devices={"device1": device_no_poll},
            drivers={driver.metadata.id: driver},
            transports={"t1": mock_transport_client},
        )

        await manager.start_polling()

        # _running is only set to True if there are devices with polling enabled
        assert manager._running is False
        assert len(manager._background_tasks) == 0

    @pytest.mark.asyncio
    async def test_start_polling_multiple_devices(self, mock_transport_client, driver):
        device1 = Device.from_driver(
            driver,
            mock_transport_client,
            {"device_id": "device1"},
            device_id="device1",
        )
        device2 = Device.from_driver(
            driver,
            mock_transport_client,
            {"device_id": "device2"},
            device_id="device2",
        )
        manager = DevicesManager(
            devices={"device1": device1, "device2": device2},
            drivers={"test_driver": driver},
            transports={"t1": mock_transport_client},
        )

        await manager.start_polling()

        assert len(manager._background_tasks) == 2

    @pytest.mark.asyncio
    async def test_stop_polling(self, devices_manager, device):
        devices_manager.devices = {"device1": device}
        await devices_manager.start_polling()

        await devices_manager.stop_polling()

        assert devices_manager._running is False
        assert len(devices_manager._background_tasks) == 0

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
        devices_manager._running = True
        mock_transport_client.read = AsyncMock(return_value="25.5")

        task = asyncio.create_task(devices_manager._device_poll_loop(device))
        devices_manager._background_tasks.add(task)

        await asyncio.sleep(0.1)

        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task

        assert mock_transport_client.read.called

    @pytest.mark.asyncio
    async def test_device_poll_loop_cancelled(self, devices_manager, device):
        devices_manager._running = True

        task = asyncio.create_task(devices_manager._device_poll_loop(device))
        task.cancel()

        with contextlib.suppress(asyncio.CancelledError):
            await task

        assert task.cancelled()


class TestDevicesManagerLoadFromRaw:
    @pytest.mark.asyncio
    async def test_load_from_raw_success(self, driver, mock_transport_client):
        devices_raw: list[DeviceRaw] = [
            DeviceRaw.model_validate(
                {
                    "id": "device1",
                    "driver": "test_driver",
                    "transport_id": "my-transport",
                    "config": {"device_id": "device1"},
                }
            ),
        ]

        manager = DevicesManager.load_from_raw(
            devices_raw, [driver], [mock_transport_client]
        )

        assert len(manager.devices) == 1
        assert "device1" in manager.devices
        assert len(manager.drivers) == 1
        assert "test_driver" in manager.drivers

    @pytest.mark.asyncio
    async def test_load_from_raw_multiple_devices(self, driver, mock_transport_client):
        devices_raw: list[DeviceRaw] = [
            DeviceRaw.model_validate(
                {
                    "id": "device1",
                    "driver": "test_driver",
                    "transport_id": "my-transport",
                    "config": {"device_id": "device1"},
                }
            ),
            DeviceRaw.model_validate(
                {
                    "id": "device2",
                    "driver": "test_driver",
                    "transport_id": "my-transport",
                    "config": {"device_id": "device2"},
                }
            ),
        ]

        manager = DevicesManager.load_from_raw(
            devices_raw, [driver], [mock_transport_client]
        )

        assert len(manager.devices) == 2
        assert len(manager.drivers) == 1


class TestDevicesManagerBuildDevice:
    def test_build_device_success(self, driver, mock_transport_client):
        device_raw: DeviceRaw = DeviceRaw.model_validate(
            {
                "id": "device1",
                "driver": "test_driver",
                "transport_id": "t1",
                "config": {"device_id": "device1"},
            }
        )

        device = DevicesManager.build_device(device_raw, driver, mock_transport_client)

        assert device.id == "device1"
        assert device.driver.metadata.id == "test_driver"


class TestDevicesManagerListeners:
    def test_add_device_attribute_listener(self, devices_manager, device):
        callback_called = False

        def callback(_device_obj, _attribute_name, _attribute) -> None:
            nonlocal callback_called
            callback_called = True

        devices_manager.add_device_attribute_listener(callback)

        assert len(devices_manager._attribute_listeners) == 1
        assert callback in device._update_listeners

    def test_add_device_attribute_listener_multiple_devices(
        self, devices_manager, mock_transport_client, driver
    ):
        device1 = Device.from_driver(
            driver,
            mock_transport_client,
            {"device_id": "device1"},
            device_id="device1",
        )
        device2 = Device.from_driver(
            driver,
            mock_transport_client,
            {"device_id": "device2"},
            device_id="device2",
        )
        devices_manager.devices = {"device1": device1, "device2": device2}

        callback_called_count = 0

        def callback(_device_obj, _attribute_name, _attribute) -> None:
            nonlocal callback_called_count
            callback_called_count += 1

        devices_manager.add_device_attribute_listener(callback)

        assert callback in device1._update_listeners
        assert callback in device2._update_listeners

    def test_attach_listeners(self, devices_manager, mock_transport_client, driver):
        callback_called = False

        def callback(_device_obj, _attribute_name, _attribute) -> None:
            nonlocal callback_called
            callback_called = True

        devices_manager.add_device_attribute_listener(callback)

        new_device = Device.from_driver(
            driver,
            mock_transport_client,
            {"device_id": "device2"},
            device_id="device2",
        )

        devices_manager._attach_listeners(new_device)

        assert callback in new_device._update_listeners
