import asyncio
import contextlib
from unittest.mock import AsyncMock

import pytest
from devices_manager import DevicesManager
from devices_manager.core.device import Device, DeviceBase
from devices_manager.core.driver import Driver, UpdateStrategy
from devices_manager.dto import (
    DriverDTO,
    TransportBaseDTO,
    TransportCreateDTO,
    TransportUpdateDTO,
    driver_core_to_dto,
)
from devices_manager.errors import ForbiddenError, NotFoundError
from devices_manager.types import TransportProtocols


@pytest.fixture
def devices_manager(mock_transport_client, device, driver):
    return DevicesManager(
        devices={"device1": device},
        drivers={driver.id: driver},
        transports={mock_transport_client.id: mock_transport_client},
    )


class TestDevicesManagerInit:
    def test_init_empty(self):
        manager = DevicesManager(devices={}, drivers={}, transports={})
        assert isinstance(manager, DevicesManager)


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
        await dm.discovery_manager.register(
            driver_id=driver_id, transport_id=transport_id
        )
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
        await dm.discovery_manager.register(
            driver_id=driver_id, transport_id=transport_id
        )
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

        await dm.discovery_manager.register(
            driver_id=driver_id, transport_id=transport_id
        )
        await dm.discovery_manager.unregister(
            driver_id=driver_id, transport_id=transport_id
        )
        await mock_push_transport_client.simulate_event(
            "/xx",
            {"id": "abc", "gateway_id": "gtw", "payload": {"temperature": 22}},
        )
        assert len(dm.devices) == 0


class TestDevicesManagerListTransports:
    def test_transport_ids(self, devices_manager):
        transport_ids = devices_manager.transport_ids
        assert isinstance(transport_ids, set)
        assert all(isinstance(t, str) for t in transport_ids)
        assert len(transport_ids) > 0

    def test_list_transports(self, devices_manager):
        transports = devices_manager.list_transports()
        assert isinstance(transports, list)
        assert all(isinstance(t, TransportBaseDTO) for t in transports)


class TestDevicesManagerGetTransport:
    def test_get_transport_existing(self, devices_manager, mock_transport_client):
        transport = devices_manager.get_transport(mock_transport_client.id)
        assert isinstance(transport, TransportBaseDTO)
        assert transport.id == mock_transport_client.id

    def test_get_transport_non_existing(self, devices_manager):
        with pytest.raises(NotFoundError):
            devices_manager.get_transport("non-existing-id")


class TestDevicesManagerAddTransport:
    def test_add_transport(self, devices_manager):
        transport_data = TransportCreateDTO(
            name="New Transport",
            protocol=TransportProtocols.HTTP,
            config={},  # ty: ignore[invalid-argument-type]
        )
        new_transport = devices_manager.add_transport(transport_data)
        assert new_transport.name == transport_data.name
        assert new_transport.protocol == transport_data.protocol
        assert new_transport.config == transport_data.config
        assert devices_manager.get_transport(new_transport.id) is not None


class TestDevicesManagerDeleteTransport:
    @pytest.mark.asyncio
    async def test_delete_transport(self, mock_push_transport_client):
        dm = DevicesManager(
            devices={},
            drivers={},
            transports={mock_push_transport_client.id: mock_push_transport_client},
        )
        transport_id = mock_push_transport_client.id
        await dm.delete_transport(transport_id)
        with pytest.raises(NotFoundError):
            dm.get_transport(mock_push_transport_client.id)

    @pytest.mark.asyncio
    async def test_delete_non_existing_transport(self, devices_manager):
        with pytest.raises(NotFoundError):
            await devices_manager.delete_transport("non-existing-id")

    @pytest.mark.asyncio
    async def test_delete_transport_in_use(self, devices_manager, device):
        device = next(iter(devices_manager.devices.values()))
        transport_id = device.transport.id
        with pytest.raises(ForbiddenError):
            await devices_manager.delete_transport(transport_id)


class TestDevicesManagerUpdateTransport:
    @pytest.mark.asyncio
    async def test_update_non_existing_transport(self, devices_manager):
        with pytest.raises(NotFoundError):
            await devices_manager.update_transport(
                "non-existing-id", TransportUpdateDTO(name="x", config={"a": 2})
            )

    @pytest.mark.asyncio
    async def test_update_empty_payload(self, mock_transport_client):
        dm = DevicesManager(
            devices={},
            drivers={},
            transports={mock_transport_client.id: mock_transport_client},
        )
        transport_id = mock_transport_client.id

        updated_transport = await dm.update_transport(
            transport_id, TransportUpdateDTO()
        )
        assert updated_transport.name == mock_transport_client.metadata.name
        assert updated_transport.config == mock_transport_client.config

    @pytest.mark.asyncio
    async def test_update_transport_name(self, devices_manager, mock_transport_client):
        transport_id = mock_transport_client.id
        new_name = "Updated Transport Name"
        updated_transport = await devices_manager.update_transport(
            transport_id, TransportUpdateDTO(name=new_name)
        )
        assert updated_transport.name == new_name
        assert devices_manager.get_transport(transport_id).name == new_name

    @pytest.mark.asyncio
    async def test_update_transport_config_ok(self, mock_transport_client):
        dm = DevicesManager(
            devices={},
            drivers={},
            transports={mock_transport_client.id: mock_transport_client},
        )
        transport_id = mock_transport_client.id
        new_config = {"request_timeout": 5}
        updated_transport = await dm.update_transport(
            transport_id, TransportUpdateDTO(config=new_config)
        )
        assert updated_transport.config.model_dump() == new_config
        assert dm.get_transport(transport_id).config.model_dump() == new_config


class TestDevicesManagerDrivers:
    def test_list_driver_ids(self, devices_manager):
        driver_ids = devices_manager.driver_ids
        assert isinstance(driver_ids, set)
        assert all(isinstance(d, str) for d in driver_ids)
        assert len(driver_ids) > 0

    def test_list_drivers(self, devices_manager):
        drivers = devices_manager.list_drivers()
        assert isinstance(drivers, list)
        assert all(isinstance(d, DriverDTO) for d in drivers)

    def test_get_driver_existing(self, devices_manager, driver):
        driver_id = driver.id
        driver_dto = devices_manager.get_driver(driver_id)
        assert isinstance(driver_dto, DriverDTO)
        assert driver_dto.id == driver_id

    def test_get_driver_non_existing(self, devices_manager):
        with pytest.raises(NotFoundError):
            devices_manager.get_driver("non-existing-driver-id")

    def test_add_driver_ok(self, driver):
        dm = DevicesManager(devices={}, drivers={}, transports={})
        driver_dto = driver_core_to_dto(driver)

        created = dm.add_driver(driver_dto)

        assert isinstance(created, DriverDTO)
        assert created.id == driver_dto.id
        assert dm.get_driver(driver_dto.id) is not None

    def test_add_driver_conflict(self, driver):
        dm = DevicesManager(devices={}, drivers={}, transports={})
        driver_dto = driver_core_to_dto(driver)

        dm.add_driver(driver_dto)

        with pytest.raises(ValueError):  # noqa: PT011
            dm.add_driver(driver_dto)

    def test_delete_driver_ok(self, driver):
        devices_manager = DevicesManager(
            devices={},
            drivers={driver.id: driver},
            transports={},
        )
        devices_manager.delete_driver(driver.id)
        with pytest.raises(NotFoundError):
            devices_manager.get_driver(driver.id)

    def test_delete_driver_not_found(self, devices_manager):
        with pytest.raises(NotFoundError):
            devices_manager.delete_driver("unknown")

    def test_delete_driver_in_use(self, devices_manager, driver):
        with pytest.raises(ForbiddenError):
            devices_manager.delete_driver(driver.id)
