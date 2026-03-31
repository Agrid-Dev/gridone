import asyncio
import contextlib
from pathlib import Path
from unittest.mock import AsyncMock

import pytest
from devices_manager import DevicesManager
from devices_manager.core.device import Attribute, DeviceBase, PhysicalDevice
from devices_manager.core.driver import Driver, UpdateStrategy
from devices_manager.dto import (
    AttributeCreateDTO,
    DeviceDTO,
    DeviceUpdateDTO,
    DriverDTO,
    TransportBaseDTO,
    TransportCreateDTO,
    TransportUpdateDTO,
    VirtualDeviceCreateDTO,
    device_core_to_dto,
    driver_core_to_dto,
    transport_core_to_dto,
)
from devices_manager.dto import (
    PhysicalDeviceCreateDTO as DeviceCreateDTO,
)
from devices_manager.storage.yaml.core_file_storage import CoreFileStorage
from devices_manager.types import (
    DataType,
    DeviceConfig,
    DeviceKind,
    ReadWriteMode,
    TransportProtocols,
)
from models.errors import (
    ForbiddenError,
    InvalidError,
    NotFoundError,
)


@pytest.fixture
def devices_manager(mock_transport_client, device, driver):
    return DevicesManager(
        devices={device.id: device},
        drivers={driver.id: driver},
        transports={mock_transport_client.id: mock_transport_client},
    )


class TestDevicesManagerInit:
    def test_init_empty(self):
        manager = DevicesManager(devices={}, drivers={}, transports={})
        assert isinstance(manager, DevicesManager)


class TestDevicesManagerPolling:
    @pytest.mark.asyncio
    async def test_start_polling_with_polling_enabled(self, devices_manager):
        await devices_manager.start_polling()

        assert devices_manager._running is True
        assert devices_manager.poll_count == 1

    @pytest.mark.asyncio
    async def test_start_polling_without_polling_enabled(
        self,
        mock_transport_client,
        driver: Driver,
    ):
        driver.update_strategy = UpdateStrategy(polling_enabled=False)

        device_no_poll = PhysicalDevice.from_base(
            DeviceBase(id="d1", name="My device", config={"some_id": "abc"}),
            driver=driver,
            transport=mock_transport_client,
        )
        manager = DevicesManager(
            devices={device_no_poll.id: device_no_poll},
            drivers={driver.metadata.id: driver},
            transports={"t1": mock_transport_client},
        )

        await manager.start_polling()

        assert manager.poll_count == 0

    @pytest.mark.asyncio
    async def test_start_polling_multiple_devices(self, mock_transport_client, driver):
        device1 = PhysicalDevice.from_base(
            DeviceBase(id="device1", name="device1", config={}),
            transport=mock_transport_client,
            driver=driver,
        )
        device2 = PhysicalDevice.from_base(
            DeviceBase(id="device2", name="device2", config={}),
            driver=driver,
            transport=mock_transport_client,
        )
        manager = DevicesManager(
            devices={device1.id: device1, device2.id: device2},
            drivers={"test_driver": driver},
            transports={"t1": mock_transport_client},
        )

        await manager.start_polling()

        assert manager.poll_count == 2

    @pytest.mark.asyncio
    async def test_start_polling_all_devices_are_polled(
        self, mock_transport_client, driver
    ):
        """Regression: all devices must be polled, not just the last one."""
        n_readable_attrs = len(driver.attributes)
        device1 = PhysicalDevice.from_base(
            DeviceBase(id="device1", name="device1", config={"some_id": "abc"}),
            transport=mock_transport_client,
            driver=driver,
        )
        device2 = PhysicalDevice.from_base(
            DeviceBase(id="device2", name="device2", config={"some_id": "xyz"}),
            driver=driver,
            transport=mock_transport_client,
        )
        manager = DevicesManager(
            devices={device1.id: device1, device2.id: device2},
            drivers={"test_driver": driver},
            transports={"t1": mock_transport_client},
        )
        mock_transport_client.read = AsyncMock(return_value="25.5")

        await manager.start_polling()
        await asyncio.sleep(0.1)  # Should send first poll for both
        await manager.stop_polling()

        assert mock_transport_client.read.call_count >= 2 * n_readable_attrs

    @pytest.mark.asyncio
    async def test_stop_polling(self, devices_manager):
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
    async def test_device_poll_loop(self, devices_manager, mock_transport_client):
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

    def test_attach_listeners(self, devices_manager, device):
        callback_called = False

        def callback_spy(_device_obj, _attribute_name, _attribute) -> None:
            nonlocal callback_called
            callback_called = True

        devices_manager.add_device_attribute_listener(callback_spy)
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
        await asyncio.sleep(0.05)
        assert len(dm.list_devices()) == 1
        device = dm.list_devices()[0]
        assert device.config is not None
        assert device.config["vendor_id"] == "abc"
        assert device.config["gateway_id"] == "gtw"
        # add only once
        await mock_push_transport_client.simulate_event(
            "/xx",
            {"id": "abc", "gateway_id": "gtw", "payload": {"temperature": 22}},
        )
        assert len(dm.list_devices()) == 1

    @pytest.mark.asyncio
    async def test_devices_manager_does_not_add_existing_device_on_discovery(
        self, driver_w_push_transport, mock_push_transport_client
    ):
        driver_id = driver_w_push_transport.id
        transport_id = mock_push_transport_client.id
        config: DeviceConfig = {
            "vendor_id": "abc",
            "gateway_id": "gtw",
        }
        device = PhysicalDevice.from_base(
            DeviceBase(id="xyz", name="My device", config=config),
            driver=driver_w_push_transport,
            transport=mock_push_transport_client,
        )
        dm = DevicesManager(
            devices={device.id: device},
            drivers={driver_id: driver_w_push_transport},
            transports={transport_id: mock_push_transport_client},
        )
        assert len(dm.list_devices()) == 1
        await dm.discovery_manager.register(
            driver_id=driver_id, transport_id=transport_id
        )
        await mock_push_transport_client.simulate_event(
            "/xx",
            {"id": "abc", "gateway_id": "gtw", "payload": {"temperature": 22}},
        )
        assert len(dm.list_devices()) == 1

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
        assert len(dm.list_devices()) == 0


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
    @pytest.mark.asyncio
    async def test_add_transport(self, devices_manager):
        transport_data = TransportCreateDTO(
            name="New Transport",
            protocol=TransportProtocols.HTTP,
            config={},  # ty: ignore[invalid-argument-type]
        )
        new_transport = await devices_manager.add_transport(transport_data)
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

    def test_list_drivers_filter_by_type(self, thermostat_driver, other_http_driver):
        dm = DevicesManager(
            devices={},
            drivers={
                thermostat_driver.id: thermostat_driver,
                other_http_driver.id: other_http_driver,
            },
            transports={},
        )

        result = dm.list_drivers(device_type="thermostat")

        assert len(result) == 1
        assert result[0].id == thermostat_driver.id

    def test_list_drivers_filter_by_type_no_match(self, driver):
        dm = DevicesManager(devices={}, drivers={driver.id: driver}, transports={})

        result = dm.list_drivers(device_type="unknown")

        assert result == []

    def test_get_driver_existing(self, devices_manager, driver):
        driver_id = driver.id
        driver_dto = devices_manager.get_driver(driver_id)
        assert isinstance(driver_dto, DriverDTO)
        assert driver_dto.id == driver_id

    def test_get_driver_non_existing(self, devices_manager):
        with pytest.raises(NotFoundError):
            devices_manager.get_driver("non-existing-driver-id")

    @pytest.mark.asyncio
    async def test_add_driver_ok(self, driver):
        dm = DevicesManager(devices={}, drivers={}, transports={})
        driver_dto = driver_core_to_dto(driver)

        created = await dm.add_driver(driver_dto)

        assert isinstance(created, DriverDTO)
        assert created.id == driver_dto.id
        assert dm.get_driver(driver_dto.id) is not None

    @pytest.mark.asyncio
    async def test_add_driver_conflict(self, driver):
        dm = DevicesManager(devices={}, drivers={}, transports={})
        driver_dto = driver_core_to_dto(driver)

        await dm.add_driver(driver_dto)

        with pytest.raises(ValueError):  # noqa: PT011
            await dm.add_driver(driver_dto)

    @pytest.mark.asyncio
    async def test_delete_driver_ok(self, driver):
        devices_manager = DevicesManager(
            devices={},
            drivers={driver.id: driver},
            transports={},
        )
        await devices_manager.delete_driver(driver.id)
        with pytest.raises(NotFoundError):
            devices_manager.get_driver(driver.id)

    @pytest.mark.asyncio
    async def test_delete_driver_not_found(self, devices_manager):
        with pytest.raises(NotFoundError):
            await devices_manager.delete_driver("unknown")

    @pytest.mark.asyncio
    async def test_delete_driver_in_use(self, devices_manager, driver):
        with pytest.raises(ForbiddenError):
            await devices_manager.delete_driver(driver.id)


class TestDevicesManagerDevices:
    def test_device_ids(self, devices_manager):
        device_ids = devices_manager.device_ids
        assert isinstance(device_ids, set)
        assert all(isinstance(d, str) for d in device_ids)

    def test_list_devices(self, devices_manager):
        devices = devices_manager.list_devices()
        assert len(devices) > 0
        assert all(isinstance(d, DeviceDTO) for d in devices)

    def test_list_devices_filter_by_type(
        self, thermostat_driver, driver, mock_transport_client
    ):
        device_typed = PhysicalDevice.from_base(
            DeviceBase(id="d1", name="Typed", config={}),
            driver=thermostat_driver,
            transport=mock_transport_client,
        )
        device_untyped = PhysicalDevice.from_base(
            DeviceBase(id="d2", name="Untyped", config={}),
            driver=driver,
            transport=mock_transport_client,
        )
        dm = DevicesManager(
            devices={device_typed.id: device_typed, device_untyped.id: device_untyped},
            drivers={
                thermostat_driver.id: thermostat_driver,
                driver.id: driver,
            },
            transports={mock_transport_client.id: mock_transport_client},
        )

        result = dm.list_devices(device_type="thermostat")

        assert len(result) == 1
        assert result[0].id == "d1"

    def test_list_devices_filter_by_type_no_match(self, devices_manager):
        result = devices_manager.list_devices(device_type="unknown")

        assert result == []

    def test_get_device_ok(self, devices_manager, device):
        result = devices_manager.get_device(device.id)
        assert isinstance(result, DeviceDTO)
        assert result.id == device.id

    def test_get_device_not_found(self, devices_manager):
        with pytest.raises(NotFoundError):
            devices_manager.get_device("unknown")

    # Create device
    @pytest.mark.asyncio
    async def test_add_device_ok(self, devices_manager, driver, mock_transport_client):
        device_create = DeviceCreateDTO(
            name="New Device",
            config={"some_id": "new_abc"},
            driver_id=driver.id,
            transport_id=mock_transport_client.id,
        )

        result = await devices_manager.add_device(device_create)

        assert isinstance(result, DeviceDTO)
        assert result.name == "New Device"
        assert result.config == {"some_id": "new_abc"}
        assert result.driver_id == driver.id
        assert result.transport_id == mock_transport_client.id
        assert result.id in devices_manager.device_ids

    @pytest.mark.asyncio
    async def test_add_device_driver_not_found(
        self, devices_manager, mock_transport_client
    ):
        device_create = DeviceCreateDTO(
            name="Bad Device",
            config={"some_id": "abc"},
            driver_id="non_existing_driver",
            transport_id=mock_transport_client.id,
        )

        with pytest.raises(NotFoundError):
            await devices_manager.add_device(device_create)

    @pytest.mark.asyncio
    async def test_add_device_transport_not_found(self, devices_manager, driver):
        device_create = DeviceCreateDTO(
            name="Bad Device",
            config={"some_id": "abc"},
            driver_id=driver.id,
            transport_id="non_existing_transport",
        )

        with pytest.raises(NotFoundError):
            await devices_manager.add_device(device_create)

    @pytest.mark.asyncio
    async def test_add_device_incompatible_transport(
        self, driver, mock_push_transport_client
    ):
        dm = DevicesManager(
            devices={},
            drivers={driver.id: driver},
            transports={mock_push_transport_client.id: mock_push_transport_client},
        )
        device_create = DeviceCreateDTO(
            name="Bad Device",
            config={"some_id": "abc"},
            driver_id=driver.id,
            transport_id=mock_push_transport_client.id,
        )

        with pytest.raises(ValueError):  # noqa: PT011
            await dm.add_device(device_create)

    @pytest.mark.asyncio
    async def test_add_device_invalid_config(
        self, devices_manager, driver, mock_transport_client
    ):
        device_create = DeviceCreateDTO(
            name="Bad Device",
            config={},
            driver_id=driver.id,
            transport_id=mock_transport_client.id,
        )

        with pytest.raises(InvalidError):
            await devices_manager.add_device(device_create)

    # Delete device
    @pytest.mark.asyncio
    async def test_delete_device_ok(self, devices_manager):
        device_ids = devices_manager.device_ids
        assert len(device_ids) > 0, "Cannot run delete test without devices"
        initial_count = len(device_ids)
        for i, device_id in enumerate(device_ids):
            await devices_manager.delete_device(device_id)
            assert len(devices_manager.device_ids) == initial_count - i - 1

    @pytest.mark.asyncio
    async def test_delete_device_not_found(self, devices_manager):
        with pytest.raises(NotFoundError):
            await devices_manager.delete_device("unknown_id")

    # Update device
    @pytest.mark.asyncio
    async def test_devices_manager_update_device_name(self, devices_manager):
        assert len(devices_manager.device_ids) > 0, "Test needs at least one device"
        device_id = next(iter(devices_manager.device_ids))
        new_name = "My new device name"
        update = DeviceUpdateDTO(name=new_name)
        await devices_manager.update_device(device_id, update)
        assert devices_manager.get_device(device_id).name == new_name

    @pytest.mark.asyncio
    async def test_update_empty_payload(self, devices_manager):
        assert len(devices_manager.device_ids) > 0, "Test needs at least one device"
        device_id = next(iter(devices_manager.device_ids))
        previous_name = devices_manager.get_device(device_id).name
        update = DeviceUpdateDTO()
        await devices_manager.update_device(device_id, update)
        assert devices_manager.get_device(device_id).name == previous_name

    @pytest.mark.asyncio
    async def test_devices_manager_update_not_found(self, devices_manager):
        update = DeviceUpdateDTO(name="My new name")
        with pytest.raises(NotFoundError):
            await devices_manager.update_device("unknown-id", update)

    @pytest.mark.asyncio
    async def test_devices_manager_update_config_ok(self, devices_manager):
        assert len(devices_manager.device_ids) > 0, "Test needs at least one device"
        device_id = next(iter(devices_manager.device_ids))
        new_config = {"some_id": "xyz"}
        update = DeviceUpdateDTO(config=new_config)
        await devices_manager.update_device(device_id, update)
        updated_device = devices_manager.get_device(device_id)
        assert updated_device.config == new_config

    @pytest.mark.asyncio
    async def test_devices_manager_update_config_invalid(self, devices_manager):
        assert len(devices_manager.device_ids) > 0, "Test needs at least one device"
        device_id = next(iter(devices_manager.device_ids))
        new_config = {}
        update = DeviceUpdateDTO(config=new_config)
        with pytest.raises(InvalidError):
            await devices_manager.update_device(device_id, update)

    @pytest.mark.asyncio
    async def test_update_driver_not_found(self, devices_manager):
        assert len(devices_manager.device_ids) > 0, "Test needs at least one device"
        device_id = next(iter(devices_manager.device_ids))
        update = DeviceUpdateDTO(driver_id="unknown_id")
        with pytest.raises(NotFoundError):
            await devices_manager.update_device(device_id, update)

    # Update transport
    @pytest.mark.asyncio
    async def test_update_transport_ok(
        self, device, driver, mock_transport_client, second_mock_transport_client
    ):
        dm = DevicesManager(
            devices={device.id: device},
            drivers={driver.id: driver},
            transports={
                mock_transport_client.id: mock_transport_client,
                second_mock_transport_client.id: second_mock_transport_client,
            },
        )
        update = DeviceUpdateDTO(transport_id=second_mock_transport_client.id)
        result = await dm.update_device(device.id, update)
        assert result.transport_id == second_mock_transport_client.id

    @pytest.mark.asyncio
    async def test_update_transport_not_found(self, devices_manager):
        device_id = next(iter(devices_manager.device_ids))
        update = DeviceUpdateDTO(transport_id="non_existing_transport")
        with pytest.raises(NotFoundError):
            await devices_manager.update_device(device_id, update)

    @pytest.mark.asyncio
    async def test_update_transport_incompatible(
        self, device, driver, mock_transport_client, mock_push_transport_client
    ):
        """HTTP driver + MQTT transport → ValueError."""
        dm = DevicesManager(
            devices={device.id: device},
            drivers={driver.id: driver},
            transports={
                mock_transport_client.id: mock_transport_client,
                mock_push_transport_client.id: mock_push_transport_client,
            },
        )
        update = DeviceUpdateDTO(transport_id=mock_push_transport_client.id)
        with pytest.raises(ValueError):  # noqa: PT011
            await dm.update_device(device.id, update)

    # Update driver
    @pytest.mark.asyncio
    async def test_update_driver_ok(
        self, device, driver, mock_transport_client, other_http_driver
    ):
        """Swap to a different HTTP driver.

        Device should be rebuilt with new attributes.
        """
        dm = DevicesManager(
            devices={device.id: device},
            drivers={driver.id: driver, other_http_driver.id: other_http_driver},
            transports={mock_transport_client.id: mock_transport_client},
        )
        update = DeviceUpdateDTO(driver_id=other_http_driver.id)
        result = await dm.update_device(device.id, update)
        assert result.driver_id == other_http_driver.id
        assert "power" in result.attributes

    @pytest.mark.asyncio
    async def test_update_driver_incompatible(
        self, device, driver, mock_transport_client, driver_w_push_transport
    ):
        """MQTT driver + HTTP transport → ValueError."""
        dm = DevicesManager(
            devices={device.id: device},
            drivers={
                driver.id: driver,
                driver_w_push_transport.id: driver_w_push_transport,
            },
            transports={mock_transport_client.id: mock_transport_client},
        )
        update = DeviceUpdateDTO(driver_id=driver_w_push_transport.id)
        with pytest.raises(ValueError):  # noqa: PT011
            await dm.update_device(device.id, update)

    @pytest.mark.asyncio
    async def test_update_driver_config_invalid(
        self, device, driver, mock_transport_client, strict_http_driver
    ):
        """New driver requires a field not present in existing config → InvalidError."""
        dm = DevicesManager(
            devices={device.id: device},
            drivers={driver.id: driver, strict_http_driver.id: strict_http_driver},
            transports={mock_transport_client.id: mock_transport_client},
        )
        update = DeviceUpdateDTO(driver_id=strict_http_driver.id)
        with pytest.raises(InvalidError):
            await dm.update_device(device.id, update)

    @pytest.mark.asyncio
    async def test_update_driver_preserves_compatible_attribute_values(
        self, device, driver, mock_transport_client, other_http_driver
    ):
        """Attribute values matching new driver are preserved on rebuild."""
        device.attributes["temperature"]._update_value(42.0)
        dm = DevicesManager(
            devices={device.id: device},
            drivers={driver.id: driver, other_http_driver.id: other_http_driver},
            transports={mock_transport_client.id: mock_transport_client},
        )
        update = DeviceUpdateDTO(driver_id=other_http_driver.id)
        result = await dm.update_device(device.id, update)
        assert result.attributes["temperature"].current_value == 42.0

    # Update both driver and transport
    @pytest.mark.asyncio
    async def test_update_driver_and_transport_ok(
        self,
        device,
        driver,
        mock_transport_client,
        driver_w_push_transport,
        mock_push_transport_client,
    ):
        """Switch from HTTP driver+transport to MQTT driver+transport."""
        dm = DevicesManager(
            devices={device.id: device},
            drivers={
                driver.id: driver,
                driver_w_push_transport.id: driver_w_push_transport,
            },
            transports={
                mock_transport_client.id: mock_transport_client,
                mock_push_transport_client.id: mock_push_transport_client,
            },
        )
        update = DeviceUpdateDTO(
            driver_id=driver_w_push_transport.id,
            transport_id=mock_push_transport_client.id,
        )
        result = await dm.update_device(device.id, update)
        assert result.driver_id == driver_w_push_transport.id
        assert result.transport_id == mock_push_transport_client.id

    @pytest.mark.asyncio
    async def test_update_driver_and_transport_incompatible(
        self,
        device,
        driver,
        mock_transport_client,
        second_mock_transport_client,
        driver_w_push_transport,
    ):
        """New MQTT driver + new HTTP transport → ValueError."""
        dm = DevicesManager(
            devices={device.id: device},
            drivers={
                driver.id: driver,
                driver_w_push_transport.id: driver_w_push_transport,
            },
            transports={
                mock_transport_client.id: mock_transport_client,
                second_mock_transport_client.id: second_mock_transport_client,
            },
        )
        update = DeviceUpdateDTO(
            driver_id=driver_w_push_transport.id,
            transport_id=second_mock_transport_client.id,
        )
        with pytest.raises(ValueError):  # noqa: PT011
            await dm.update_device(device.id, update)

    # Config validation when updating driver with config in payload
    @pytest.mark.asyncio
    async def test_update_driver_with_new_config_ok(
        self, device, driver, mock_transport_client, strict_http_driver
    ):
        """Driver change + new config that satisfies new driver → ok."""
        dm = DevicesManager(
            devices={device.id: device},
            drivers={driver.id: driver, strict_http_driver.id: strict_http_driver},
            transports={mock_transport_client.id: mock_transport_client},
        )
        update = DeviceUpdateDTO(
            driver_id=strict_http_driver.id,
            config={"serial": "SN-001"},
        )
        result = await dm.update_device(device.id, update)
        assert result.driver_id == strict_http_driver.id
        assert result.config == {"serial": "SN-001"}

    @pytest.mark.asyncio
    async def test_update_driver_with_new_config_invalid(
        self, device, driver, mock_transport_client, strict_http_driver
    ):
        """Driver change + new config that doesn't satisfy new driver → InvalidError."""
        dm = DevicesManager(
            devices={device.id: device},
            drivers={driver.id: driver, strict_http_driver.id: strict_http_driver},
            transports={mock_transport_client.id: mock_transport_client},
        )
        update = DeviceUpdateDTO(
            driver_id=strict_http_driver.id,
            config={"wrong_field": "value"},
        )
        with pytest.raises(InvalidError):
            await dm.update_device(device.id, update)


class TestDevicesManagerWriteAttribute:
    @pytest.mark.asyncio
    async def test_write_attribute_ok(self, devices_manager, mock_transport_client):
        mock_transport_client.write = AsyncMock()
        mock_transport_client.read = AsyncMock(return_value=22.0)
        device_id = next(iter(devices_manager.device_ids))

        await devices_manager.write_device_attribute(
            device_id, "temperature_setpoint", 22.0
        )

        mock_transport_client.write.assert_called_once()

    @pytest.mark.asyncio
    async def test_write_attribute_ok_returns_attribute(
        self, devices_manager, mock_transport_client
    ):
        mock_transport_client.write = AsyncMock()
        mock_transport_client.read = AsyncMock(return_value=22.0)
        device_id = next(iter(devices_manager.device_ids))
        result = await devices_manager.write_device_attribute(
            device_id, "temperature_setpoint", 22.0
        )
        assert isinstance(result, Attribute)
        assert result.current_value == 22.0
        assert result.last_changed is not None

    @pytest.mark.asyncio
    async def test_write_attribute_device_not_found(self, devices_manager):
        with pytest.raises(NotFoundError):
            await devices_manager.write_device_attribute(
                "unknown", "temperature_setpoint", 22.0
            )

    @pytest.mark.asyncio
    async def test_write_attribute_attribute_not_found(self, devices_manager):
        device_id = next(iter(devices_manager.device_ids))

        with pytest.raises(NotFoundError):
            await devices_manager.write_device_attribute(
                device_id, "nonexistent_attr", 22.0
            )

    @pytest.mark.asyncio
    async def test_write_attribute_not_writable(self, devices_manager):
        device_id = next(iter(devices_manager.device_ids))

        with pytest.raises(PermissionError):
            await devices_manager.write_device_attribute(device_id, "temperature", 22.0)


class TestDevicesManagerStorage:
    """Tests that mutations persist to storage when db_path is provided."""

    @pytest.fixture
    def seeded_db(self, tmp_path: Path, device, driver, mock_transport_client) -> Path:
        """Seed a tmp_path DB with one transport, one driver, one device."""
        cfs = CoreFileStorage(tmp_path)
        asyncio.run(
            cfs.transports.write(
                mock_transport_client.id, transport_core_to_dto(mock_transport_client)
            )
        )
        asyncio.run(cfs.drivers.write(driver.id, driver_core_to_dto(driver)))
        asyncio.run(cfs.devices.write(device.id, device_core_to_dto(device)))
        return tmp_path

    @pytest.mark.asyncio
    async def test_from_storage(
        self, seeded_db: Path, device, driver, mock_transport_client
    ):
        dm = await DevicesManager.from_storage(str(seeded_db))
        assert device.id in dm.device_ids
        assert driver.id in dm.driver_ids
        assert mock_transport_client.id in dm.transport_ids

    @pytest.mark.asyncio
    async def test_add_transport_persists(self, tmp_path: Path):
        dm = DevicesManager(devices={}, drivers={}, transports={}, db_path=tmp_path)
        transport = TransportCreateDTO(
            name="Test HTTP",
            protocol=TransportProtocols.HTTP,
            config={},  # ty: ignore[invalid-argument-type]
        )
        dto = await dm.add_transport(transport)
        storage = CoreFileStorage(tmp_path)
        assert (await storage.transports.read(dto.id)).id == dto.id

    @pytest.mark.asyncio
    async def test_update_transport_persists(self, tmp_path: Path):
        dm = DevicesManager(devices={}, drivers={}, transports={}, db_path=tmp_path)
        transport = TransportCreateDTO(
            name="Test HTTP",
            protocol=TransportProtocols.HTTP,
            config={},  # ty: ignore[invalid-argument-type]
        )
        dto = await dm.add_transport(transport)
        await dm.update_transport(dto.id, TransportUpdateDTO(name="Updated"))
        storage = CoreFileStorage(tmp_path)
        assert (await storage.transports.read(dto.id)).name == "Updated"

    @pytest.mark.asyncio
    async def test_delete_transport_persists(self, tmp_path: Path):
        dm = DevicesManager(devices={}, drivers={}, transports={}, db_path=tmp_path)
        transport = TransportCreateDTO(
            name="Test HTTP",
            protocol=TransportProtocols.HTTP,
            config={},  # ty: ignore[invalid-argument-type]
        )
        dto = await dm.add_transport(transport)
        await dm.delete_transport(dto.id)
        storage = CoreFileStorage(tmp_path)
        assert len(await storage.transports.read_all()) == 0

    @pytest.mark.asyncio
    async def test_add_driver_persists(self, tmp_path: Path, driver):
        dm = DevicesManager(devices={}, drivers={}, transports={}, db_path=tmp_path)
        driver_dto = driver_core_to_dto(driver)
        await dm.add_driver(driver_dto)
        storage = CoreFileStorage(tmp_path)
        assert (await storage.drivers.read(driver_dto.id)).id == driver_dto.id

    @pytest.mark.asyncio
    async def test_delete_driver_persists(self, tmp_path: Path, driver):
        dm = DevicesManager(devices={}, drivers={}, transports={}, db_path=tmp_path)
        driver_dto = driver_core_to_dto(driver)
        await dm.add_driver(driver_dto)
        await dm.delete_driver(driver_dto.id)
        storage = CoreFileStorage(tmp_path)
        assert len(await storage.drivers.read_all()) == 0

    @pytest.mark.asyncio
    async def test_add_device_persists(
        self, tmp_path: Path, driver, mock_transport_client
    ):
        dm = DevicesManager(
            devices={},
            drivers={driver.id: driver},
            transports={mock_transport_client.id: mock_transport_client},
            db_path=tmp_path,
        )
        device_create = DeviceCreateDTO(
            name="New Device",
            config={"some_id": "new_abc"},
            driver_id=driver.id,
            transport_id=mock_transport_client.id,
        )
        dto = await dm.add_device(device_create)
        storage = CoreFileStorage(tmp_path)
        assert (await storage.devices.read(dto.id)).id == dto.id

    @pytest.mark.asyncio
    async def test_attribute_persisted_and_restored_on_restart(
        self,
        seeded_db: Path,
        device,
    ):
        """Attribute value is saved to storage on change and restored after restart."""
        dm = await DevicesManager.from_storage(str(seeded_db))
        device_id = device.id

        transport_client = next(iter(dm._transports.values()))
        transport_client.write = AsyncMock()  # ty: ignore[invalid-assignment]
        transport_client.read = AsyncMock(return_value=22.0)  # ty: ignore[invalid-assignment]

        await dm.write_device_attribute(device_id, "temperature_setpoint", 22.0)
        await asyncio.sleep(0.05)

        new_dm = await DevicesManager.from_storage(str(seeded_db))
        restored = new_dm.get_device(device_id)
        restored_attr = restored.attributes["temperature_setpoint"]

        assert restored_attr.current_value == 22.0
        assert restored_attr.last_updated is not None

    @pytest.mark.asyncio
    async def test_delete_device_persists(
        self, tmp_path: Path, driver, mock_transport_client
    ):
        dm = DevicesManager(
            devices={},
            drivers={driver.id: driver},
            transports={mock_transport_client.id: mock_transport_client},
            db_path=tmp_path,
        )
        device_create = DeviceCreateDTO(
            name="New Device",
            config={"some_id": "new_abc"},
            driver_id=driver.id,
            transport_id=mock_transport_client.id,
        )
        dto = await dm.add_device(device_create)
        await dm.delete_device(dto.id)
        storage = CoreFileStorage(tmp_path)
        devices = await storage.devices.read_all()
        assert len(devices) == 0


class TestDevicesManagerRestartPolling:
    @pytest.mark.asyncio
    async def test_update_device_transport_restarts_polling(
        self, device, driver, mock_transport_client, second_mock_transport_client
    ):
        dm = DevicesManager(
            devices={device.id: device},
            drivers={driver.id: driver},
            transports={
                mock_transport_client.id: mock_transport_client,
                second_mock_transport_client.id: second_mock_transport_client,
            },
        )
        await dm.start_polling()
        assert dm.poll_count == 1

        update = DeviceUpdateDTO(transport_id=second_mock_transport_client.id)
        await dm.update_device(device.id, update)

        assert dm.poll_count == 1
        await dm.stop_polling()

    @pytest.mark.asyncio
    async def test_update_device_config_restarts_polling(
        self, device, driver, mock_transport_client
    ):
        dm = DevicesManager(
            devices={device.id: device},
            drivers={driver.id: driver},
            transports={mock_transport_client.id: mock_transport_client},
        )
        await dm.start_polling()
        assert dm.poll_count == 1

        update = DeviceUpdateDTO(config={"some_id": "new_value"})
        await dm.update_device(device.id, update)

        assert dm.poll_count == 1
        await dm.stop_polling()

    @pytest.mark.asyncio
    async def test_update_transport_restarts_polling_for_affected_devices(
        self, driver, mock_transport_client
    ):
        device1 = PhysicalDevice.from_base(
            DeviceBase(id="d1", name="Device 1", config={"some_id": "a"}),
            driver=driver,
            transport=mock_transport_client,
        )
        device2 = PhysicalDevice.from_base(
            DeviceBase(id="d2", name="Device 2", config={"some_id": "b"}),
            driver=driver,
            transport=mock_transport_client,
        )
        dm = DevicesManager(
            devices={device1.id: device1, device2.id: device2},
            drivers={driver.id: driver},
            transports={mock_transport_client.id: mock_transport_client},
        )
        await dm.start_polling()
        assert dm.poll_count == 2

        await dm.update_transport(
            mock_transport_client.id,
            TransportUpdateDTO(config={"request_timeout": 5}),
        )

        assert dm.poll_count == 2
        await dm.stop_polling()


def _virtual_attr(
    name: str, data_type: DataType, mode: ReadWriteMode = "write"
) -> AttributeCreateDTO:
    return AttributeCreateDTO(name=name, data_type=data_type, read_write_mode=mode)


class TestVirtualDeviceCreation:
    @pytest.mark.asyncio
    async def test_add_virtual_device_ok(self):
        dm = DevicesManager(devices={}, drivers={}, transports={})
        create = VirtualDeviceCreateDTO(
            name="Occupancy",
            attributes=[_virtual_attr("occupied", DataType.BOOL)],
        )
        dto = await dm.add_device(create)
        assert dto.kind == DeviceKind.VIRTUAL
        assert dto.name == "Occupancy"
        assert "occupied" in dto.attributes
        assert dto.id in dm.device_ids

    @pytest.mark.asyncio
    async def test_add_virtual_device_with_type(self):
        dm = DevicesManager(devices={}, drivers={}, transports={})
        create = VirtualDeviceCreateDTO(
            name="Energy meter",
            type="meter",
            attributes=[_virtual_attr("energy_kwh", DataType.FLOAT)],
        )
        dto = await dm.add_device(create)
        assert dto.type == "meter"

    @pytest.mark.asyncio
    async def test_virtual_device_not_polled(self):
        dm = DevicesManager(devices={}, drivers={}, transports={})
        create = VirtualDeviceCreateDTO(
            name="Sensor",
            attributes=[_virtual_attr("value", DataType.FLOAT)],
        )
        await dm.add_device(create)
        await dm.start_polling()
        assert dm.poll_count == 0
        await dm.stop_polling()

    @pytest.mark.asyncio
    async def test_add_virtual_device_persists(self, tmp_path: Path):
        dm = DevicesManager(devices={}, drivers={}, transports={}, db_path=tmp_path)
        create = VirtualDeviceCreateDTO(
            name="Switch",
            attributes=[_virtual_attr("on", DataType.BOOL)],
        )
        dto = await dm.add_device(create)
        storage = CoreFileStorage(tmp_path)
        stored = await storage.devices.read(dto.id)
        assert stored.id == dto.id
        assert stored.kind == DeviceKind.VIRTUAL
        assert "on" in stored.attributes

    @pytest.mark.asyncio
    async def test_write_virtual_attribute_value(self):
        dm = DevicesManager(devices={}, drivers={}, transports={})
        create = VirtualDeviceCreateDTO(
            name="Thermostat",
            attributes=[_virtual_attr("setpoint", DataType.FLOAT)],
        )
        dto = await dm.add_device(create)
        result = await dm.write_device_attribute(dto.id, "setpoint", 21.0)
        assert isinstance(result, Attribute)
        assert result.current_value == 21.0
        assert result.last_updated is not None


class TestVirtualDeviceRestoreFromStorage:
    @pytest.mark.asyncio
    async def test_virtual_device_restored_from_storage(self, tmp_path: Path):
        """Virtual device with attribute values is restored via from_storage."""
        dm = DevicesManager(devices={}, drivers={}, transports={}, db_path=tmp_path)
        create = VirtualDeviceCreateDTO(
            name="Switch",
            attributes=[_virtual_attr("on", DataType.BOOL)],
        )
        dto = await dm.add_device(create)
        await dm.write_device_attribute(dto.id, "on", value=True)
        await asyncio.sleep(0.05)

        new_dm = await DevicesManager.from_storage(str(tmp_path))
        restored = new_dm.get_device(dto.id)

        assert restored.kind == DeviceKind.VIRTUAL
        assert restored.attributes["on"].current_value is True
        assert restored.attributes["on"].last_updated is not None

    @pytest.mark.asyncio
    async def test_virtual_device_restored_value_not_overwritten_by_polling(
        self, tmp_path: Path
    ):
        """After restart, virtual device value stays untouched (no polling loop)."""
        dm = DevicesManager(devices={}, drivers={}, transports={}, db_path=tmp_path)
        create = VirtualDeviceCreateDTO(
            name="Setpoint",
            attributes=[_virtual_attr("temp", DataType.FLOAT)],
        )
        dto = await dm.add_device(create)
        await dm.write_device_attribute(dto.id, "temp", 22.5)
        await asyncio.sleep(0.05)

        new_dm = await DevicesManager.from_storage(str(tmp_path))
        await new_dm.start_polling()
        await asyncio.sleep(0.05)
        await new_dm.stop_polling()

        restored = new_dm.get_device(dto.id)
        assert restored.attributes["temp"].current_value == 22.5

    @pytest.mark.asyncio
    async def test_virtual_device_no_attribute_value_restores_none(
        self, tmp_path: Path
    ):
        """Virtual device with no written value restores to None on restart."""
        dm = DevicesManager(devices={}, drivers={}, transports={}, db_path=tmp_path)
        create = VirtualDeviceCreateDTO(
            name="Empty",
            attributes=[_virtual_attr("level", DataType.INT)],
        )
        dto = await dm.add_device(create)

        new_dm = await DevicesManager.from_storage(str(tmp_path))
        restored = new_dm.get_device(dto.id)
        assert restored.attributes["level"].current_value is None

    @pytest.mark.asyncio
    async def test_virtual_device_attribute_persisted_on_write(self, tmp_path: Path):
        """Attribute write triggers a storage update so the latest value is on disk."""
        dm = DevicesManager(devices={}, drivers={}, transports={}, db_path=tmp_path)
        create = VirtualDeviceCreateDTO(
            name="Counter",
            attributes=[_virtual_attr("count", DataType.INT)],
        )
        dto = await dm.add_device(create)

        await dm.write_device_attribute(dto.id, "count", 5)
        await asyncio.sleep(0.05)
        await dm.write_device_attribute(dto.id, "count", 10)
        await asyncio.sleep(0.05)

        storage = CoreFileStorage(tmp_path)
        stored = await storage.devices.read(dto.id)
        assert stored.attributes["count"].current_value == 10
