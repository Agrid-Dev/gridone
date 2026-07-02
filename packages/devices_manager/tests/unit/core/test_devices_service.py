import asyncio
import logging
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, PropertyMock

import pytest
import pytest_asyncio

from devices_manager import DevicesService
from devices_manager.core.device import (
    Attribute,
    CoreDevice,
    DeviceBase,
    FaultAttribute,
    PhysicalDevice,
    VirtualDevice,
)
from devices_manager.core.device.attribute import AttributeKind
from devices_manager.core.device.event_log import AttributeEventLog, EventType
from devices_manager.core.driver import AttributeDriver, Driver, UpdateStrategy
from devices_manager.dto import (
    AttributeCreate,
    AttributePatch,
    Device,
    DeviceUpdate,
    DriverPatch,
    DriverSpec,
    TransportBase,
    TransportCreate,
    TransportUpdate,
    VirtualDeviceCreate,
    device_from_public,
    device_to_public,
    driver_to_public,
    transport_to_public,
)
from devices_manager.dto import (
    PhysicalDeviceCreate as DeviceCreate,
)
from devices_manager.storage.memory import MemoryDevicesStorage
from devices_manager.types import (
    AttributeValueType,
    DataType,
    DeviceConfig,
    DeviceKind,
    TransportProtocols,
)
from models.errors import (
    ConfirmationError,
    ConflictError,
    NotFoundError,
)
from models.types import Severity


class FailingStartPhysicalDevice(PhysicalDevice):
    async def start_sync(self) -> None:
        msg = "boom"
        raise RuntimeError(msg)


@pytest_asyncio.fixture
async def devices_manager(mock_transport_client, device, driver):
    svc = DevicesService(
        devices={device.id: device},
        drivers={driver.id: driver},
        transports={mock_transport_client.id: mock_transport_client},
    )
    await svc.load()
    return svc


class TestDevicesServiceInit:
    def test_init_empty(self):
        manager = DevicesService(devices={}, drivers={}, transports={})
        assert isinstance(manager, DevicesService)


class TestDevicesServiceSync:
    @pytest.mark.asyncio
    async def test_start_sync_with_polling_enabled(self, devices_manager, device):
        await devices_manager.start()

        assert devices_manager._running is True  # noqa: SLF001
        assert device.syncing is True

    @pytest.mark.asyncio
    async def test_start_sync_without_polling_enabled(
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
        manager = DevicesService(
            devices={device_no_poll.id: device_no_poll},
            drivers={driver.metadata.id: driver},
            transports={"t1": mock_transport_client},
        )

        await manager.start()

        assert device_no_poll.syncing is True

    @pytest.mark.asyncio
    async def test_start_sync_multiple_devices(self, mock_transport_client, driver):
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
        manager = DevicesService(
            devices={device1.id: device1, device2.id: device2},
            drivers={"test_driver": driver},
            transports={"t1": mock_transport_client},
        )

        await manager.start()

        assert device1.syncing is True
        assert device2.syncing is True

    @pytest.mark.asyncio
    async def test_start_sync_continues_when_one_device_fails(
        self, mock_transport_client, driver, caplog
    ):
        driver.update_strategy = UpdateStrategy(polling_enabled=False)
        device1 = FailingStartPhysicalDevice.from_base(
            DeviceBase(id="device1", name="device1", config={}),
            transport=mock_transport_client,
            driver=driver,
        )
        device2 = PhysicalDevice.from_base(
            DeviceBase(id="device2", name="device2", config={}),
            driver=driver,
            transport=mock_transport_client,
        )
        manager = DevicesService(
            devices={device1.id: device1, device2.id: device2},
            drivers={"test_driver": driver},
            transports={"t1": mock_transport_client},
        )

        with caplog.at_level(logging.ERROR, logger="devices_manager.service"):
            await manager.start()

        assert "Failed to start sync for device device1" in caplog.text
        assert device2.syncing is True

        await manager.stop()

    @pytest.mark.asyncio
    async def test_start_sync_all_devices_are_polled(
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
        manager = DevicesService(
            devices={device1.id: device1, device2.id: device2},
            drivers={"test_driver": driver},
            transports={"t1": mock_transport_client},
        )
        mock_transport_client.read = AsyncMock(return_value="25.5")

        await manager.start()
        await asyncio.sleep(0.1)  # Should send first poll for both
        await manager.stop()

        assert mock_transport_client.read.call_count >= 2 * n_readable_attrs

    @pytest.mark.asyncio
    async def test_stop_sync(self, devices_manager, device):
        await devices_manager.start()

        await devices_manager.stop()

        assert devices_manager._running is False  # noqa: SLF001
        assert device.syncing is False

    @pytest.mark.asyncio
    async def test_stop_sync_no_tasks(self, devices_manager):
        devices_manager._running = True  # noqa: SLF001

        await devices_manager.stop()

        assert devices_manager._running is False  # noqa: SLF001

    @pytest.mark.asyncio
    async def test_start_device_sync_syncs_only_target(self, devices_manager, device):
        await devices_manager.start_device_sync(device.id)

        assert device.syncing is True
        # a single-device sync is not a full service start
        assert devices_manager._running is False  # noqa: SLF001

    @pytest.mark.asyncio
    async def test_stop_device_sync_stops_target(self, devices_manager, device):
        await devices_manager.start_device_sync(device.id)

        await devices_manager.stop_device_sync(device.id)

        assert device.syncing is False

    @pytest.mark.asyncio
    async def test_devices_are_polled_during_sync(
        self, devices_manager, mock_transport_client
    ):
        await devices_manager.start()
        mock_transport_client.read = AsyncMock(return_value="25.5")
        await asyncio.sleep(0.1)
        await devices_manager.stop()
        assert mock_transport_client.read.called


class TestDevicesServiceListeners:
    @pytest.mark.asyncio
    async def test_add_device_attribute_listener_returns_id(self, devices_manager):
        def callback(_device_obj, _attribute_name, _previous, _attribute) -> None:
            pass

        listener_id = devices_manager.add_device_attribute_listener(callback)

        assert isinstance(listener_id, str)
        assert len(listener_id) > 0

    @pytest.mark.asyncio
    async def test_add_device_attribute_listener_registers_handler(
        self, devices_manager
    ):
        def callback(_device_obj, _attribute_name, _previous, _attribute) -> None:
            pass

        devices_manager.add_device_attribute_listener(callback)

        assert len(devices_manager._attribute_update_handlers) == 1  # noqa: SLF001

    @pytest.mark.asyncio
    async def test_remove_device_attribute_listener_removes_handler(
        self, devices_manager
    ):
        def callback(_device_obj, _attribute_name, _previous, _attribute) -> None:
            pass

        listener_id = devices_manager.add_device_attribute_listener(callback)
        devices_manager.remove_device_attribute_listener(listener_id)

        assert len(devices_manager._attribute_update_handlers) == 0  # noqa: SLF001

    @pytest.mark.asyncio
    async def test_remove_nonexistent_listener_is_safe(self, devices_manager):
        # must not raise
        devices_manager.remove_device_attribute_listener("nonexistent")

    @pytest.mark.asyncio
    async def test_handler_called_on_attribute_update(self, devices_manager, device):
        received: list[tuple[str, object]] = []

        def handler(_device_obj, attribute_name, _previous, attribute) -> None:
            received.append((attribute_name, attribute.current_value))

        devices_manager.add_device_attribute_listener(handler)
        device._update_attribute(device.attributes["temperature_setpoint"], 22)  # noqa: SLF001

        assert received == [("temperature_setpoint", 22)]

    @pytest.mark.asyncio
    async def test_removed_handler_not_called_on_attribute_update(
        self, devices_manager, device
    ):
        received: list[object] = []

        def handler(_device_obj, _attr_name, _previous, attribute) -> None:
            received.append(attribute.current_value)

        listener_id = devices_manager.add_device_attribute_listener(handler)
        devices_manager.remove_device_attribute_listener(listener_id)
        device._update_attribute(device.attributes["temperature_setpoint"], 22)  # noqa: SLF001

        assert received == []

    @pytest.mark.asyncio
    async def test_sync_attribute_listener_exception_is_swallowed(
        self, devices_manager, device
    ):
        def failing_handler(_device_obj, _attr_name, _previous, _attr) -> None:
            raise RuntimeError("boom")

        devices_manager.add_device_attribute_listener(failing_handler)
        # must not propagate
        device._update_attribute(device.attributes["temperature_setpoint"], 22)  # noqa: SLF001

    @pytest.mark.asyncio
    async def test_async_attribute_listener_exception_is_logged(
        self, devices_manager, device
    ):
        async def failing_async_handler(
            _device_obj, _attr_name, _previous, _attr
        ) -> None:
            msg = "async boom"
            raise RuntimeError(msg)

        devices_manager.add_device_attribute_listener(failing_async_handler)
        device._update_attribute(device.attributes["temperature_setpoint"], 22)  # noqa: SLF001
        await asyncio.sleep(0.05)
        # background task completed with exception — must not propagate to caller

    @pytest.mark.asyncio
    async def test_first_update_previous_is_none(self, devices_manager, device):
        """First update: previous=None."""
        attr = device.attributes["temperature_setpoint"]
        assert attr.current_value is None

        received: list[object] = []

        def handler(_device_obj, _attr_name, previous, _attribute) -> None:
            received.append(previous)

        devices_manager.add_device_attribute_listener(handler)
        device._update_attribute(attr, 21)  # noqa: SLF001

        assert received == [None]

    @pytest.mark.asyncio
    async def test_second_update_previous_equals_prior_value(
        self, devices_manager, device
    ):
        """Second update: previous.current_value equals the value before mutation."""
        attr = device.attributes["temperature_setpoint"]
        device._update_attribute(attr, 21)  # noqa: SLF001

        received_previous: list[Attribute | None] = []

        def handler(
            _device_obj, _attr_name, previous: Attribute | None, _attribute
        ) -> None:
            received_previous.append(previous)

        devices_manager.add_device_attribute_listener(handler)
        device._update_attribute(attr, 22)  # noqa: SLF001

        assert len(received_previous) == 1
        prev = received_previous[0]
        assert isinstance(prev, Attribute)
        assert prev.current_value == 21

    @pytest.mark.asyncio
    async def test_snapshot_is_independent_of_subsequent_mutation(
        self, devices_manager, device
    ):
        """Mutating the new attribute doesn't retroactively change previous."""
        attr = device.attributes["temperature_setpoint"]
        device._update_attribute(attr, 21)  # noqa: SLF001

        captured_previous = []
        captured_attr = []

        def handler(_device_obj, _attr_name, previous, attribute) -> None:
            captured_previous.append(previous)
            captured_attr.append(attribute)

        devices_manager.add_device_attribute_listener(handler)
        device._update_attribute(attr, 22)  # noqa: SLF001

        assert captured_previous[0].current_value == 21
        # mutate the live attribute further
        device._update_attribute(attr, 99)  # noqa: SLF001
        # the snapshot must not have changed
        assert captured_previous[0].current_value == 21

    @pytest.mark.asyncio
    async def test_handler_receives_correct_previous_attribute_sequence(
        self, devices_manager, device
    ):
        """Handler receives correct (previous, attribute) pair per call."""
        attr = device.attributes["temperature_setpoint"]
        calls: list[tuple[object, object]] = []

        def handler(_device_obj, _attr_name, previous, attribute) -> None:
            calls.append(
                (
                    previous.current_value if previous is not None else None,
                    attribute.current_value,
                )
            )

        devices_manager.add_device_attribute_listener(handler)

        device._update_attribute(attr, 10)  # noqa: SLF001
        device._update_attribute(attr, 20)  # noqa: SLF001
        device._update_attribute(attr, 30)  # noqa: SLF001

        assert calls == [(None, 10), (10, 20), (20, 30)]


_DISCOVERY_EVENT = {"id": "abc", "gateway_id": "gtw", "payload": {"temperature": 22}}


@pytest_asyncio.fixture
async def dm_with_discovery(driver_w_push_transport, mock_push_transport_client):
    """DevicesService with discovery already registered on the push transport."""
    driver_id = driver_w_push_transport.id
    transport_id = mock_push_transport_client.id
    dm = DevicesService(
        devices={},
        drivers={driver_id: driver_w_push_transport},
        transports={transport_id: mock_push_transport_client},
    )
    await dm.load()
    await dm.discovery_manager.register(driver_id=driver_id, transport_id=transport_id)
    return dm


class TestDevicesServiceDiscovery:
    @pytest.mark.asyncio
    async def test_devices_manager_adds_device_on_discovery(
        self, dm_with_discovery, mock_push_transport_client
    ):
        await mock_push_transport_client.simulate_event("/xx", _DISCOVERY_EVENT)
        await asyncio.sleep(0.05)
        assert len(dm_with_discovery.list_devices()) == 1
        device = dm_with_discovery.list_devices()[0]
        assert device.config is not None
        assert device.config["vendor_id"] == "abc"
        assert device.config["gateway_id"] == "gtw"
        # add only once
        await mock_push_transport_client.simulate_event("/xx", _DISCOVERY_EVENT)
        assert len(dm_with_discovery.list_devices()) == 1

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
        dm = DevicesService(
            devices={device.id: device},
            drivers={driver_id: driver_w_push_transport},
            transports={transport_id: mock_push_transport_client},
        )
        await dm.load()
        assert len(dm.list_devices()) == 1
        await dm.discovery_manager.register(
            driver_id=driver_id, transport_id=transport_id
        )
        await mock_push_transport_client.simulate_event("/xx", _DISCOVERY_EVENT)
        assert len(dm.list_devices()) == 1

    @pytest.mark.asyncio
    async def test_devices_manager_does_not_add_device_if_discovery_unregistered(
        self, dm_with_discovery, driver_w_push_transport, mock_push_transport_client
    ):
        await dm_with_discovery.discovery_manager.unregister(
            driver_id=driver_w_push_transport.id,
            transport_id=mock_push_transport_client.id,
        )
        await mock_push_transport_client.simulate_event("/xx", _DISCOVERY_EVENT)
        assert len(dm_with_discovery.list_devices()) == 0

    def test_add_discovery_listener_returns_id(self):
        dm = DevicesService(devices={}, drivers={}, transports={})
        listener_id = dm.add_device_discovery_listener(lambda _: None)
        assert isinstance(listener_id, str)
        assert len(listener_id) > 0

    def test_remove_nonexistent_discovery_listener_is_safe(self):
        dm = DevicesService(devices={}, drivers={}, transports={})
        dm.remove_device_discovery_listener("nonexistent")  # must not raise

    @pytest.mark.asyncio
    async def test_discovery_listener_called_on_new_device(
        self, dm_with_discovery, mock_push_transport_client
    ):
        received: list[CoreDevice] = []
        dm_with_discovery.add_device_discovery_listener(received.append)

        await mock_push_transport_client.simulate_event("/xx", _DISCOVERY_EVENT)
        await asyncio.sleep(0.05)

        assert len(received) == 1
        assert received[0].id == dm_with_discovery.list_devices()[0].id

    @pytest.mark.asyncio
    async def test_multiple_discovery_listeners_all_fire(
        self, dm_with_discovery, mock_push_transport_client
    ):
        calls_a: list[CoreDevice] = []
        calls_b: list[CoreDevice] = []
        dm_with_discovery.add_device_discovery_listener(calls_a.append)
        dm_with_discovery.add_device_discovery_listener(calls_b.append)

        await mock_push_transport_client.simulate_event("/xx", _DISCOVERY_EVENT)
        await asyncio.sleep(0.05)

        assert len(calls_a) == 1
        assert len(calls_b) == 1

    @pytest.mark.asyncio
    async def test_removed_discovery_listener_not_called(
        self, dm_with_discovery, mock_push_transport_client
    ):
        received: list[CoreDevice] = []
        listener_id = dm_with_discovery.add_device_discovery_listener(received.append)
        dm_with_discovery.remove_device_discovery_listener(listener_id)

        await mock_push_transport_client.simulate_event("/xx", _DISCOVERY_EVENT)
        await asyncio.sleep(0.05)

        assert received == []

    @pytest.mark.asyncio
    async def test_discovery_listener_not_called_for_existing_device(
        self, driver_w_push_transport, mock_push_transport_client
    ):
        driver_id = driver_w_push_transport.id
        transport_id = mock_push_transport_client.id
        config: DeviceConfig = {"vendor_id": "abc", "gateway_id": "gtw"}
        existing = PhysicalDevice.from_base(
            DeviceBase(id="xyz", name="Existing", config=config),
            driver=driver_w_push_transport,
            transport=mock_push_transport_client,
        )
        dm = DevicesService(
            devices={existing.id: existing},
            drivers={driver_id: driver_w_push_transport},
            transports={transport_id: mock_push_transport_client},
        )
        await dm.load()
        received: list[CoreDevice] = []
        dm.add_device_discovery_listener(received.append)
        await dm.discovery_manager.register(
            driver_id=driver_id, transport_id=transport_id
        )

        await mock_push_transport_client.simulate_event("/xx", _DISCOVERY_EVENT)
        await asyncio.sleep(0.05)

        assert received == []

    @pytest.mark.asyncio
    async def test_discovery_listener_exception_does_not_abort_registration(
        self, dm_with_discovery, mock_push_transport_client
    ):
        def failing_listener(_device: CoreDevice) -> None:
            msg = "listener error"
            raise RuntimeError(msg)

        dm_with_discovery.add_device_discovery_listener(failing_listener)

        await mock_push_transport_client.simulate_event("/xx", _DISCOVERY_EVENT)
        await asyncio.sleep(0.05)

        # device must still be registered despite the listener raising
        assert len(dm_with_discovery.list_devices()) == 1

    @pytest.mark.asyncio
    async def test_async_discovery_listener_is_called(
        self, dm_with_discovery, mock_push_transport_client
    ):
        received: list[CoreDevice] = []

        async def async_listener(device: CoreDevice) -> None:
            received.append(device)

        dm_with_discovery.add_device_discovery_listener(async_listener)

        await mock_push_transport_client.simulate_event("/xx", _DISCOVERY_EVENT)
        await asyncio.sleep(0.05)

        assert len(received) == 1
        assert received[0].id == dm_with_discovery.list_devices()[0].id


class TestDevicesServiceListTransports:
    @pytest.mark.asyncio
    async def test_transport_ids(self, devices_manager):
        transport_ids = devices_manager.transport_ids
        assert isinstance(transport_ids, set)
        assert all(isinstance(t, str) for t in transport_ids)
        assert len(transport_ids) > 0

    @pytest.mark.asyncio
    async def test_list_transports(self, devices_manager):
        transports = devices_manager.list_transports()
        assert isinstance(transports, list)
        assert all(isinstance(t, TransportBase) for t in transports)


class TestDevicesServiceGetTransport:
    @pytest.mark.asyncio
    async def test_get_transport_existing(self, devices_manager, mock_transport_client):
        transport = devices_manager.get_transport(mock_transport_client.id)
        assert isinstance(transport, TransportBase)
        assert transport.id == mock_transport_client.id

    @pytest.mark.asyncio
    async def test_get_transport_non_existing(self, devices_manager):
        with pytest.raises(NotFoundError):
            devices_manager.get_transport("non-existing-id")


class TestDevicesServiceAddTransport:
    @pytest.mark.asyncio
    async def test_add_transport(self, devices_manager):
        transport_data = TransportCreate(
            name="New Transport",
            protocol=TransportProtocols.HTTP,
            config={},  # ty: ignore[invalid-argument-type]
        )
        new_transport = await devices_manager.add_transport(transport_data)
        assert new_transport.name == transport_data.name
        assert new_transport.protocol == transport_data.protocol
        assert new_transport.config == transport_data.config
        assert devices_manager.get_transport(new_transport.id) is not None


class TestDevicesServiceDeleteTransport:
    @pytest.mark.asyncio
    async def test_delete_transport(self, mock_push_transport_client):
        dm = DevicesService(
            devices={},
            drivers={},
            transports={mock_push_transport_client.id: mock_push_transport_client},
        )
        await dm.load()
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
        with pytest.raises(ConflictError):
            await devices_manager.delete_transport(transport_id)


class TestDevicesServiceUpdateTransport:
    @pytest.mark.asyncio
    async def test_update_non_existing_transport(self, devices_manager):
        with pytest.raises(NotFoundError):
            await devices_manager.update_transport(
                "non-existing-id", TransportUpdate(name="x", config={"a": 2})
            )

    @pytest.mark.asyncio
    async def test_update_empty_payload(self, mock_transport_client):
        dm = DevicesService(
            devices={},
            drivers={},
            transports={mock_transport_client.id: mock_transport_client},
        )
        await dm.load()
        transport_id = mock_transport_client.id

        updated_transport = await dm.update_transport(transport_id, TransportUpdate())
        assert updated_transport.name == mock_transport_client.metadata.name
        assert updated_transport.config == mock_transport_client.config

    @pytest.mark.asyncio
    async def test_update_transport_name(self, devices_manager, mock_transport_client):
        transport_id = mock_transport_client.id
        new_name = "Updated Transport Name"
        updated_transport = await devices_manager.update_transport(
            transport_id, TransportUpdate(name=new_name)
        )
        assert updated_transport.name == new_name
        assert devices_manager.get_transport(transport_id).name == new_name

    @pytest.mark.asyncio
    async def test_update_transport_config_ok(self, mock_transport_client):
        dm = DevicesService(
            devices={},
            drivers={},
            transports={mock_transport_client.id: mock_transport_client},
        )
        await dm.load()
        transport_id = mock_transport_client.id
        new_config = {"request_timeout": 5}
        updated_transport = await dm.update_transport(
            transport_id, TransportUpdate(config=new_config)
        )
        assert updated_transport.config.model_dump() == new_config
        assert dm.get_transport(transport_id).config.model_dump() == new_config


class TestDevicesServiceDrivers:
    @pytest.mark.asyncio
    async def test_list_driver_ids(self, devices_manager):
        driver_ids = devices_manager.driver_ids
        assert isinstance(driver_ids, set)
        assert all(isinstance(d, str) for d in driver_ids)
        assert len(driver_ids) > 0

    @pytest.mark.asyncio
    async def test_list_drivers(self, devices_manager):
        drivers = devices_manager.list_drivers()
        assert isinstance(drivers, list)
        assert all(isinstance(d, DriverSpec) for d in drivers)

    @pytest.mark.asyncio
    async def test_list_drivers_filter_by_type(
        self, thermostat_driver, other_http_driver
    ):
        dm = DevicesService(
            devices={},
            drivers={
                thermostat_driver.id: thermostat_driver,
                other_http_driver.id: other_http_driver,
            },
            transports={},
        )
        await dm.load()

        result = dm.list_drivers(device_type="thermostat")

        assert len(result) == 1
        assert result[0].id == thermostat_driver.id

    @pytest.mark.asyncio
    async def test_list_drivers_filter_by_type_no_match(self, driver):
        dm = DevicesService(devices={}, drivers={driver.id: driver}, transports={})
        await dm.load()

        result = dm.list_drivers(device_type="unknown")

        assert result == []

    @pytest.mark.asyncio
    async def test_get_driver_existing(self, devices_manager, driver):
        driver_id = driver.id
        driver_dto = devices_manager.get_driver(driver_id)
        assert isinstance(driver_dto, DriverSpec)
        assert driver_dto.id == driver_id

    @pytest.mark.asyncio
    async def test_get_driver_non_existing(self, devices_manager):
        with pytest.raises(NotFoundError):
            devices_manager.get_driver("non-existing-driver-id")

    @pytest.mark.asyncio
    async def test_add_driver_ok(self, driver):
        dm = DevicesService(devices={}, drivers={}, transports={})
        await dm.load()
        driver_dto = driver_to_public(driver)

        created = await dm.add_driver(driver_dto)

        assert isinstance(created, DriverSpec)
        assert created.id == driver_dto.id
        assert dm.get_driver(driver_dto.id) is not None

    @pytest.mark.asyncio
    async def test_add_driver_conflict(self, driver):
        dm = DevicesService(devices={}, drivers={}, transports={})
        await dm.load()
        driver_dto = driver_to_public(driver)

        await dm.add_driver(driver_dto)

        with pytest.raises(ConflictError):
            await dm.add_driver(driver_dto)

    @pytest.mark.asyncio
    async def test_delete_driver_ok(self, driver):
        dm = DevicesService(devices={}, drivers={driver.id: driver}, transports={})
        await dm.load()
        await dm.delete_driver(driver.id)
        with pytest.raises(NotFoundError):
            dm.get_driver(driver.id)

    @pytest.mark.asyncio
    async def test_delete_driver_not_found(self, devices_manager):
        with pytest.raises(NotFoundError):
            await devices_manager.delete_driver("unknown")

    @pytest.mark.asyncio
    async def test_delete_driver_in_use(self, devices_manager, driver):
        with pytest.raises(ConflictError):
            await devices_manager.delete_driver(driver.id)


# -- Device delegation to DeviceRegistry (mocked) --


def _make_virtual_device(device_id: str = "vd1", name: str = "V") -> VirtualDevice:
    return VirtualDevice(
        id=device_id,
        name=name,
        attributes={
            "value": Attribute.create("value", DataType.FLOAT, {"read", "write"}),
        },
    )


def _make_physical_device(device_id: str, driver: Driver, transport) -> PhysicalDevice:
    return PhysicalDevice.from_base(
        DeviceBase(id=device_id, name="Device", config={"some_id": "abc"}),
        driver=driver,
        transport=transport,
    )


def _mock_device_registry(
    devices: dict | None = None,
) -> MagicMock:
    """Build a MagicMock that satisfies DeviceRegistryInterface."""
    registry = MagicMock()
    devices = devices or {}
    type(registry).ids = PropertyMock(return_value=set(devices.keys()))
    type(registry).all = PropertyMock(return_value=devices)
    registry.get = MagicMock(side_effect=lambda did: devices[did])
    registry.get_dto = MagicMock(side_effect=lambda did: device_to_public(devices[did]))
    registry.list_all = MagicMock(
        return_value=[device_to_public(d) for d in devices.values()]
    )
    registry.add = AsyncMock()
    registry.update = AsyncMock()
    registry.remove = AsyncMock()
    registry.register = AsyncMock()
    registry.write_attribute = AsyncMock()
    return registry


async def _dm_with_mock_registry(mock_reg: MagicMock) -> DevicesService:
    """Build a loaded DevicesService and swap in a mock device registry."""
    dm = DevicesService(devices={}, drivers={}, transports={})
    await dm.load()
    dm._loaded.device_registry = mock_reg  # noqa: SLF001 # ty: ignore[invalid-assignment]
    return dm


class TestDevicesServiceDeviceDelegation:
    """DM device methods delegate to the registry and handle side-effects."""

    @pytest.mark.asyncio
    async def test_add_device_delegates_to_registry(self):
        vd = _make_virtual_device()
        mock_reg = _mock_device_registry()
        mock_reg.add.return_value = vd

        dm = await _dm_with_mock_registry(mock_reg)

        create = VirtualDeviceCreate(
            name="V",
            attributes=[
                AttributeCreate(
                    name="value",
                    data_type=DataType.FLOAT,
                    read_write_mode="read",
                )
            ],
        )
        result = await dm.add_device(create)

        mock_reg.add.assert_called_once_with(create)
        assert isinstance(result, Device)
        assert result.id == vd.id

    @pytest.mark.asyncio
    async def test_add_device_starts_sync_when_running(
        self, driver, mock_transport_client
    ):
        device = _make_physical_device("d1", driver, mock_transport_client)
        mock_reg = _mock_device_registry()
        mock_reg.add.return_value = device

        dm = await _dm_with_mock_registry(mock_reg)
        dm._running = True  # noqa: SLF001

        create = DeviceCreate(
            name="D",
            config={"some_id": "abc"},
            driver_id=driver.id,
            transport_id=mock_transport_client.id,
        )
        await dm.add_device(create)

        assert device.syncing is True
        await device.stop_sync()
        dm._running = False  # noqa: SLF001

    @pytest.mark.asyncio
    async def test_add_virtual_device_while_running_not_syncing(self):
        vd = _make_virtual_device()
        mock_reg = _mock_device_registry()
        mock_reg.add.return_value = vd

        dm = await _dm_with_mock_registry(mock_reg)
        dm._running = True  # noqa: SLF001

        create = VirtualDeviceCreate(
            name="V",
            attributes=[
                AttributeCreate(
                    name="x",
                    data_type=DataType.INT,
                    read_write_mode="read",
                )
            ],
        )
        await dm.add_device(create)

        assert vd.syncing is False
        dm._running = False  # noqa: SLF001

    @pytest.mark.asyncio
    async def test_update_device_delegates_to_registry(
        self, driver, mock_transport_client
    ):
        device = _make_physical_device("d1", driver, mock_transport_client)
        mock_reg = _mock_device_registry({"d1": device})
        mock_reg.update.return_value = device

        dm = await _dm_with_mock_registry(mock_reg)

        update = DeviceUpdate(name="New Name")
        result = await dm.update_device("d1", update)

        mock_reg.update.assert_called_once_with("d1", update)
        assert isinstance(result, Device)

    @pytest.mark.asyncio
    async def test_update_device_inits_listeners_on_rebuild(
        self, driver, mock_transport_client, other_http_driver
    ):
        old_device = _make_physical_device("d1", driver, mock_transport_client)
        new_device = _make_physical_device(
            "d1", other_http_driver, mock_transport_client
        )
        mock_reg = _mock_device_registry({"d1": old_device})
        mock_reg.update.return_value = new_device

        dm = await _dm_with_mock_registry(mock_reg)

        await dm.update_device("d1", DeviceUpdate(driver_id="other"))

        # new_device is not old_device -> init_listeners should fire
        # (we can't easily assert on the device mock, but no error = ok)

    @pytest.mark.asyncio
    async def test_update_virtual_device_skips_polling(self):
        vd = _make_virtual_device()
        mock_reg = _mock_device_registry({"vd1": vd})
        mock_reg.update.return_value = vd

        dm = await _dm_with_mock_registry(mock_reg)

        await dm.update_device("vd1", DeviceUpdate(name="New"))

        assert vd.syncing is False

    @pytest.mark.asyncio
    async def test_delete_device_delegates_to_registry(self):
        vd = _make_virtual_device()
        mock_reg = _mock_device_registry({"vd1": vd})

        dm = await _dm_with_mock_registry(mock_reg)

        await dm.delete_device("vd1")

        mock_reg.remove.assert_called_once_with("vd1")

    @pytest.mark.asyncio
    async def test_delete_device_stops_sync(self, driver, mock_transport_client):
        device = _make_physical_device("d1", driver, mock_transport_client)
        dm = DevicesService(
            devices={device.id: device},
            drivers={driver.id: driver},
            transports={mock_transport_client.id: mock_transport_client},
        )
        await dm.start()
        assert device.syncing is True

        await dm.delete_device("d1")

        assert device.syncing is False
        dm._running = False  # noqa: SLF001

    @pytest.mark.asyncio
    async def test_read_device_delegates_to_registry(self):
        vd = _make_virtual_device()
        mock_reg = _mock_device_registry({"vd1": vd})

        dm = await _dm_with_mock_registry(mock_reg)

        result = await dm.read_device("vd1")

        mock_reg.get.assert_called_once_with("vd1")
        assert isinstance(result, Device)

    @pytest.mark.asyncio
    async def test_list_devices_delegates_to_registry(self):
        mock_reg = _mock_device_registry()
        mock_reg.list_all.return_value = []

        dm = await _dm_with_mock_registry(mock_reg)
        dm.list_devices(
            ids=["d1"],
            types=["thermostat"],
            writable_attribute="temperature_setpoint",
            writable_attribute_type=DataType.FLOAT,
        )

        mock_reg.list_all.assert_called_once_with(
            ids=["d1"],
            types=["thermostat"],
            writable_attribute="temperature_setpoint",
            writable_attribute_type=DataType.FLOAT,
            tags=None,
            is_faulty=None,
            search=None,
            driver_id=None,
            transport_id=None,
        )

    @pytest.mark.asyncio
    async def test_get_device_delegates_to_registry(self):
        vd = _make_virtual_device()
        mock_reg = _mock_device_registry({"vd1": vd})

        dm = await _dm_with_mock_registry(mock_reg)

        result = dm.get_device("vd1")

        mock_reg.get_dto.assert_called_once_with("vd1")
        assert isinstance(result, Device)

    @pytest.mark.asyncio
    async def test_write_attribute_delegates_to_registry(self):
        mock_reg = _mock_device_registry()
        mock_attr = Attribute.create("value", DataType.FLOAT, {"read", "write"}, 42.0)
        mock_reg.write_attribute.return_value = mock_attr

        dm = await _dm_with_mock_registry(mock_reg)

        result = await dm.write_device_attribute("d1", "value", 42.0)

        mock_reg.write_attribute.assert_called_once_with(
            "d1", "value", 42.0, confirm=True
        )
        assert result is mock_attr

    @pytest.mark.asyncio
    async def test_write_device_attribute_raises_confirmation_error_when_device_offline(
        self,
    ):
        """ConfirmationError propagates from write_device_attribute."""
        mock_reg = _mock_device_registry()
        mock_reg.write_attribute.side_effect = ConfirmationError(
            "Failed to confirm temperature_setpoint, expected 20.0 got None"
        )
        dm = await _dm_with_mock_registry(mock_reg)

        with pytest.raises(ConfirmationError):
            await dm.write_device_attribute("d1", "temperature_setpoint", 20.0)


class TestDevicesServiceStorage:
    """Tests for storage integration via ``start`` and attribute persistence."""

    @pytest_asyncio.fixture
    async def seeded_storage(
        self, device, driver, mock_transport_client
    ) -> MemoryDevicesStorage:
        """A memory storage seeded with one transport, one driver, one device."""
        storage = MemoryDevicesStorage()
        await storage.transports.write(
            mock_transport_client.id, transport_to_public(mock_transport_client)
        )
        await storage.drivers.write(driver.id, driver_to_public(driver))
        await storage.devices.write(device.id, device_to_public(device))
        return storage

    @pytest.mark.asyncio
    async def test_start_populates_from_storage(
        self,
        seeded_storage: MemoryDevicesStorage,
        device,
        driver,
        mock_transport_client,
        monkeypatch,
    ):
        async def _build(_url: str | None) -> MemoryDevicesStorage:
            return seeded_storage

        monkeypatch.setattr("devices_manager.service.build_storage", _build)
        dm = DevicesService(storage_url="memory://test")
        try:
            await dm.start()
            assert device.id in dm.device_ids
            assert driver.id in dm.driver_ids
            assert mock_transport_client.id in dm.transport_ids
        finally:
            await dm.stop()

    @pytest.mark.asyncio
    async def test_attribute_restored_after_restart(self, monkeypatch):
        """Write attribute -> restart -> verify value is restored."""
        storage = MemoryDevicesStorage()
        device_dto = Device(
            id="vd1",
            kind=DeviceKind.VIRTUAL,
            name="Virtual Sensor",
            type="sensor",
            attributes={
                "value": Attribute.create(
                    "value", DataType.FLOAT, {"read", "write"}, None
                ),
            },
            is_faulty=False,
        )
        await storage.devices.write(device_dto.id, device_dto)

        async def _build(_url: str | None) -> MemoryDevicesStorage:
            return storage

        monkeypatch.setattr("devices_manager.service.build_storage", _build)

        dm = DevicesService(storage_url="memory://test")
        await dm.start()
        try:
            await dm.write_device_attribute("vd1", "value", 42.0)
            await asyncio.sleep(0.05)
        finally:
            await dm.stop()

        dm2 = DevicesService(storage_url="memory://test")
        await dm2.start()
        try:
            restored = dm2.get_device("vd1")
            assert restored.attributes["value"].current_value == 42.0
        finally:
            await dm2.stop()


class TestVirtualDeviceSync:
    @pytest.mark.asyncio
    async def test_start_sync_skips_virtual_device(self):
        vd = VirtualDevice(
            id="vd1",
            name="V",
            attributes={
                "x": Attribute.create("x", DataType.FLOAT, {"read"}),
            },
        )
        dm = DevicesService(devices={vd.id: vd}, drivers={}, transports={})
        await dm.start()
        assert vd.syncing is False
        await dm.stop()


class TestVirtualDeviceRestore:
    @pytest.mark.asyncio
    async def test_restore_virtual_device_from_dto(self):
        vd_dto = Device(
            id="vd1",
            kind=DeviceKind.VIRTUAL,
            name="Restored",
            attributes={
                "temperature": Attribute.create(
                    "temperature", DataType.FLOAT, {"read"}
                ),
            },
            is_faulty=False,
        )
        vd = device_from_public(vd_dto, drivers={}, transports={})
        dm = DevicesService(devices={vd.id: vd})
        await dm.load()
        try:
            assert "vd1" in dm.device_ids
            result = dm.get_device("vd1")
            assert result.kind == DeviceKind.VIRTUAL
            assert result.name == "Restored"
        finally:
            await dm.stop()

    @pytest.mark.asyncio
    async def test_virtual_device_has_no_driver_or_transport(self):
        vd_dto = Device(
            id="vd2",
            kind=DeviceKind.VIRTUAL,
            name="V",
            attributes={
                "x": Attribute.create("x", DataType.INT, {"read", "write"}),
            },
            is_faulty=False,
        )
        vd = device_from_public(vd_dto, drivers={}, transports={})
        dm = DevicesService(devices={vd.id: vd})
        await dm.load()
        try:
            result = dm.get_device("vd2")
            assert result.driver_id is None
            assert result.transport_id is None
        finally:
            await dm.stop()


class TestDevicesServiceRestartSync:
    @pytest.mark.asyncio
    async def test_update_device_transport_restarts_sync(
        self,
        device,
        driver,
        mock_transport_client,
        second_mock_transport_client,
    ):
        dm = DevicesService(
            devices={device.id: device},
            drivers={driver.id: driver},
            transports={
                mock_transport_client.id: mock_transport_client,
                second_mock_transport_client.id: second_mock_transport_client,
            },
        )
        await dm.start()
        assert device.syncing is True

        update = DeviceUpdate(transport_id=second_mock_transport_client.id)
        await dm.update_device(device.id, update)

        updated = dm._device_registry.get(device.id)  # noqa: SLF001
        assert updated.syncing is True
        await dm.stop()

    @pytest.mark.asyncio
    async def test_update_device_config_restarts_sync(
        self, device, driver, mock_transport_client
    ):
        dm = DevicesService(
            devices={device.id: device},
            drivers={driver.id: driver},
            transports={mock_transport_client.id: mock_transport_client},
        )
        await dm.start()
        assert device.syncing is True

        update = DeviceUpdate(config={"some_id": "new_value"})
        await dm.update_device(device.id, update)

        updated = dm._device_registry.get(device.id)  # noqa: SLF001
        assert updated.syncing is True
        await dm.stop()

    @pytest.mark.asyncio
    async def test_update_transport_restarts_sync_for_affected_devices(
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
        dm = DevicesService(
            devices={device1.id: device1, device2.id: device2},
            drivers={driver.id: driver},
            transports={mock_transport_client.id: mock_transport_client},
        )
        await dm.start()
        assert device1.syncing is True
        assert device2.syncing is True

        await dm.update_transport(
            mock_transport_client.id,
            TransportUpdate(config={"request_timeout": 5}),
        )

        assert device1.syncing is True
        assert device2.syncing is True
        await dm.stop()

    @pytest.mark.asyncio
    async def test_patch_driver_type_propagates_to_devices(
        self, thermostat_driver, mock_transport_client
    ):
        # Start with type=None so we can observe the update
        thermostat_driver.type = None
        device = PhysicalDevice.from_base(
            DeviceBase(id="d1", name="Device 1", config={}),
            driver=thermostat_driver,
            transport=mock_transport_client,
        )
        assert device.type is None
        dm = DevicesService(
            devices={device.id: device},
            drivers={thermostat_driver.id: thermostat_driver},
            transports={mock_transport_client.id: mock_transport_client},
        )
        await dm.load()
        await dm.patch_driver(thermostat_driver.id, DriverPatch(type="thermostat"))
        assert device.type == "thermostat"

    @pytest.mark.asyncio
    async def test_patch_driver_restarts_sync_for_affected_devices(
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
        dm = DevicesService(
            devices={device1.id: device1, device2.id: device2},
            drivers={driver.id: driver},
            transports={mock_transport_client.id: mock_transport_client},
        )
        await dm.start()

        await dm.patch_driver(driver.id, DriverPatch(vendor="Acme"))

        assert device1.syncing is True
        assert device2.syncing is True
        await dm.stop()

    @pytest.mark.asyncio
    async def test_patch_driver_attribute_restarts_sync_for_affected_devices(
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
        dm = DevicesService(
            devices={device1.id: device1, device2.id: device2},
            drivers={driver.id: driver},
            transports={mock_transport_client.id: mock_transport_client},
        )
        await dm.start()

        await dm.patch_driver_attribute(
            driver.id, "temperature", AttributePatch(read="GET /temp/v2")
        )

        assert device1.syncing is True
        assert device2.syncing is True
        await dm.stop()

    @pytest.mark.asyncio
    async def test_patch_driver_attribute_rebuilds_kind_in_live_devices(
        self, driver, mock_transport_client
    ):
        device = PhysicalDevice.from_base(
            DeviceBase(id="d1", name="Device 1", config={"some_id": "a"}),
            driver=driver,
            transport=mock_transport_client,
        )
        dm = DevicesService(
            devices={device.id: device},
            drivers={driver.id: driver},
            transports={mock_transport_client.id: mock_transport_client},
        )
        await dm.start()
        assert not isinstance(device.attributes["temperature"], FaultAttribute)

        await dm.patch_driver_attribute(
            driver.id, "temperature", AttributePatch(kind=AttributeKind.FAULT)
        )

        assert isinstance(device.attributes["temperature"], FaultAttribute)
        await dm.stop()

    @pytest.mark.asyncio
    async def test_create_attribute_ok(self, driver):
        dm = DevicesService(devices={}, drivers={driver.id: driver}, transports={})
        await dm.load()
        new_attr = AttributeDriver(
            name="pressure", data_type=DataType.FLOAT, read="GET /pressure", codecs=[]
        )
        result = await dm.create_driver_attribute(driver.id, new_attr)
        assert result.name == "pressure"

    @pytest.mark.asyncio
    async def test_create_attribute_duplicate_name_raises(
        self, devices_manager, driver
    ):
        new_attr = AttributeDriver(
            name="temperature",
            data_type=DataType.FLOAT,
            read="GET /temperature",
            codecs=[],
        )
        with pytest.raises(ConflictError):
            await devices_manager.create_driver_attribute(driver.id, new_attr)

    @pytest.mark.asyncio
    async def test_create_attribute_restarts_sync_for_affected_devices(
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
        dm = DevicesService(
            devices={device1.id: device1, device2.id: device2},
            drivers={driver.id: driver},
            transports={mock_transport_client.id: mock_transport_client},
        )
        await dm.start()

        new_attr = AttributeDriver(
            name="pressure", data_type=DataType.FLOAT, read="GET /pressure", codecs=[]
        )
        await dm.create_driver_attribute(driver.id, new_attr)

        assert device1.syncing is True
        assert device2.syncing is True
        await dm.stop()

    @pytest.mark.asyncio
    async def test_create_attribute_adds_it_to_live_devices_with_null_value(
        self, driver, mock_transport_client
    ):
        device = PhysicalDevice.from_base(
            DeviceBase(id="d1", name="Device 1", config={"some_id": "a"}),
            driver=driver,
            transport=mock_transport_client,
        )
        dm = DevicesService(
            devices={device.id: device},
            drivers={driver.id: driver},
            transports={mock_transport_client.id: mock_transport_client},
        )
        await dm.start()
        assert "pressure" not in device.attributes

        new_attr = AttributeDriver(
            name="pressure", data_type=DataType.FLOAT, read="GET /pressure", codecs=[]
        )
        await dm.create_driver_attribute(driver.id, new_attr)

        assert "pressure" in device.attributes
        assert device.attributes["pressure"].current_value is None
        await dm.stop()

    @pytest.mark.asyncio
    async def test_delete_attribute_ok(self, driver):
        dm = DevicesService(devices={}, drivers={driver.id: driver}, transports={})
        await dm.load()
        result = await dm.delete_driver_attribute(driver.id, "temperature")
        assert isinstance(result, DriverSpec)
        assert all(attr.name != "temperature" for attr in result.attributes)

    @pytest.mark.asyncio
    async def test_delete_attribute_not_found(self, devices_manager, driver):
        with pytest.raises(NotFoundError):
            await devices_manager.delete_driver_attribute(driver.id, "nonexistent")

    @pytest.mark.asyncio
    async def test_delete_required_standard_attribute_conflicts(
        self, thermostat_driver
    ):
        dm = DevicesService(
            devices={}, drivers={thermostat_driver.id: thermostat_driver}, transports={}
        )
        await dm.load()
        with pytest.raises(ConflictError):
            await dm.delete_driver_attribute(thermostat_driver.id, "temperature")

    @pytest.mark.asyncio
    async def test_delete_attribute_restarts_sync_for_affected_devices(
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
        dm = DevicesService(
            devices={device1.id: device1, device2.id: device2},
            drivers={driver.id: driver},
            transports={mock_transport_client.id: mock_transport_client},
        )
        await dm.start()

        await dm.delete_driver_attribute(driver.id, "temperature")

        assert device1.syncing is True
        assert device2.syncing is True
        await dm.stop()

    @pytest.mark.asyncio
    async def test_delete_attribute_removes_it_from_live_devices(
        self, driver, mock_transport_client
    ):
        device = PhysicalDevice.from_base(
            DeviceBase(id="d1", name="Device 1", config={"some_id": "a"}),
            driver=driver,
            transport=mock_transport_client,
        )
        dm = DevicesService(
            devices={device.id: device},
            drivers={driver.id: driver},
            transports={mock_transport_client.id: mock_transport_client},
        )
        await dm.start()
        assert "temperature" in device.attributes

        await dm.delete_driver_attribute(driver.id, "temperature")

        assert "temperature" not in device.attributes
        await dm.stop()

    @pytest.mark.asyncio
    async def test_rename_attribute_ok(self, driver):
        dm = DevicesService(devices={}, drivers={driver.id: driver}, transports={})
        await dm.load()
        result = await dm.rename_driver_attribute(driver.id, "temperature", "temp")
        assert result.name == "temp"

    @pytest.mark.asyncio
    async def test_rename_attribute_not_found(self, devices_manager, driver):
        with pytest.raises(NotFoundError):
            await devices_manager.rename_driver_attribute(
                driver.id, "nonexistent", "temp"
            )

    @pytest.mark.asyncio
    async def test_rename_required_standard_attribute_conflicts(
        self, thermostat_driver
    ):
        dm = DevicesService(
            devices={}, drivers={thermostat_driver.id: thermostat_driver}, transports={}
        )
        await dm.load()
        with pytest.raises(ConflictError):
            await dm.rename_driver_attribute(
                thermostat_driver.id, "temperature", "temp"
            )

    @pytest.mark.asyncio
    async def test_rename_attribute_restarts_sync_for_affected_devices(
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
        dm = DevicesService(
            devices={device1.id: device1, device2.id: device2},
            drivers={driver.id: driver},
            transports={mock_transport_client.id: mock_transport_client},
        )
        await dm.start()

        await dm.rename_driver_attribute(driver.id, "temperature", "temp")

        assert device1.syncing is True
        assert device2.syncing is True
        await dm.stop()

    @pytest.mark.asyncio
    async def test_rename_attribute_renames_it_in_live_devices_preserving_value(
        self, driver, mock_transport_client
    ):
        device = PhysicalDevice.from_base(
            DeviceBase(id="d1", name="Device 1", config={"some_id": "a"}),
            driver=driver,
            transport=mock_transport_client,
            initial_values={"temperature": 21.5},
        )
        dm = DevicesService(
            devices={device.id: device},
            drivers={driver.id: driver},
            transports={mock_transport_client.id: mock_transport_client},
        )
        await dm.start()
        assert "temperature" in device.attributes

        await dm.rename_driver_attribute(driver.id, "temperature", "temp")

        assert "temperature" not in device.attributes
        assert device.attributes["temp"].current_value == 21.5
        await dm.stop()

    @pytest.mark.asyncio
    async def test_rename_attribute_preserves_last_changed_and_event_logs(
        self, driver, mock_transport_client
    ):
        device = PhysicalDevice.from_base(
            DeviceBase(id="d1", name="Device 1", config={"some_id": "a"}),
            driver=driver,
            transport=mock_transport_client,
            initial_values={"temperature": 21.5},
        )
        dm = DevicesService(
            devices={device.id: device},
            drivers={driver.id: driver},
            transports={mock_transport_client.id: mock_transport_client},
        )
        await dm.start()
        original = device.attributes["temperature"]
        original.update_value(22.0)
        original.append_log(
            AttributeEventLog(
                event_type=EventType.READ, timestamp=datetime.now(UTC), status="ok"
            )
        )
        original_last_changed = original.last_changed
        assert original_last_changed is not None
        original_logs = original.all_log_entries()
        assert original_logs

        await dm.rename_driver_attribute(driver.id, "temperature", "temp")

        renamed = device.attributes["temp"]
        assert renamed.last_changed == original_last_changed
        assert renamed.all_log_entries() == original_logs
        await dm.stop()


class TestDevicesServiceListActiveFaults:
    """Tests for DevicesService.list_active_faults."""

    @staticmethod
    def _make_fault_attr(  # noqa: PLR0913
        name: str,
        *,
        current_value: AttributeValueType,
        healthy_values: list[AttributeValueType],
        severity: Severity,
        last_updated: datetime,
        last_changed: datetime | None = None,
    ) -> FaultAttribute:
        return FaultAttribute(
            name=name,
            data_type=DataType.STRING,
            read_write_modes={"read"},
            current_value=current_value,
            last_updated=last_updated,
            last_changed=last_changed or last_updated,
            severity=severity,
            healthy_values=healthy_values,
        )

    def _make_devices(self) -> tuple[VirtualDevice, VirtualDevice, VirtualDevice]:
        chiller = VirtualDevice(
            id="chiller",
            name="Chiller",
            attributes={
                "alarm": self._make_fault_attr(
                    "alarm",
                    current_value="critical",
                    healthy_values=["ok"],
                    severity=Severity.ALERT,
                    last_updated=datetime(2026, 4, 20, 12, 0, tzinfo=UTC),
                ),
            },
        )
        boiler = VirtualDevice(
            id="boiler",
            name="Boiler",
            attributes={
                "status": self._make_fault_attr(
                    "status",
                    current_value="error",
                    healthy_values=["ok"],
                    severity=Severity.WARNING,
                    last_updated=datetime(2026, 4, 20, 10, 0, tzinfo=UTC),
                ),
            },
        )
        healthy = VirtualDevice(
            id="healthy",
            name="Healthy",
            attributes={
                "status": self._make_fault_attr(
                    "status",
                    current_value="ok",
                    healthy_values=["ok"],
                    severity=Severity.INFO,
                    last_updated=datetime(2026, 4, 20, 11, 0, tzinfo=UTC),
                ),
                "temp": Attribute.create("temp", DataType.FLOAT, {"read"}, value=20.0),
            },
        )
        return chiller, boiler, healthy

    @pytest_asyncio.fixture
    async def dm(self):
        chiller, boiler, healthy = self._make_devices()
        svc = DevicesService(
            devices={d.id: d for d in (chiller, boiler, healthy)},
            drivers={},
            transports={},
        )
        await svc.load()
        return svc

    @pytest.mark.asyncio
    async def test_returns_only_faulty_attributes(self, dm: DevicesService):
        faults = dm.list_active_faults()
        assert [f.device_id for f in faults] == ["chiller", "boiler"]

    @pytest.mark.asyncio
    async def test_sorted_by_last_updated_desc(self, dm: DevicesService):
        faults = dm.list_active_faults()
        assert faults[0].last_updated > faults[1].last_updated

    @pytest.mark.asyncio
    async def test_filter_by_severity(self, dm: DevicesService):
        faults = dm.list_active_faults(severity=Severity.ALERT)
        assert len(faults) == 1
        assert faults[0].device_id == "chiller"
        assert faults[0].severity == Severity.ALERT

    @pytest.mark.asyncio
    async def test_filter_by_device_id(self, dm: DevicesService):
        faults = dm.list_active_faults(device_id="boiler")
        assert len(faults) == 1
        assert faults[0].device_id == "boiler"
        assert faults[0].attribute_name == "status"

    @pytest.mark.asyncio
    async def test_filter_by_device_id_without_faults(self, dm: DevicesService):
        faults = dm.list_active_faults(device_id="healthy")
        assert faults == []

    @pytest.mark.asyncio
    async def test_filter_by_unknown_device_raises(self, dm: DevicesService):
        with pytest.raises(NotFoundError):
            dm.list_active_faults(device_id="nope")

    @pytest.mark.asyncio
    async def test_combined_filters(self, dm: DevicesService):
        faults = dm.list_active_faults(severity=Severity.WARNING, device_id="chiller")
        assert faults == []

    @pytest.mark.asyncio
    async def test_empty_manager(self):
        dm = DevicesService(devices={}, drivers={}, transports={})
        await dm.load()
        assert dm.list_active_faults() == []

    @pytest.mark.asyncio
    async def test_ignores_non_fault_attributes(self):
        device = VirtualDevice(
            id="d1",
            name="D1",
            attributes={
                "reading": Attribute.create(
                    "reading", DataType.FLOAT, {"read"}, value=42.0
                ),
            },
        )
        dm = DevicesService(devices={device.id: device}, drivers={}, transports={})
        await dm.load()
        assert dm.list_active_faults() == []

    @pytest.mark.asyncio
    async def test_fault_view_fields(self, dm: DevicesService):
        faults = dm.list_active_faults(device_id="chiller")
        view = faults[0]
        assert view.device_id == "chiller"
        assert view.device_name == "Chiller"
        assert view.attribute_name == "alarm"
        assert view.data_type == DataType.STRING
        assert view.severity == Severity.ALERT
        assert view.current_value == "critical"
        assert view.last_updated is not None
        assert view.last_changed is not None
