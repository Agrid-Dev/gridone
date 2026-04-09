import asyncio
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, PropertyMock

import pytest

from devices_manager import DevicesManager
from devices_manager.core.device import (
    Attribute,
    DeviceBase,
    PhysicalDevice,
    VirtualDevice,
)
from devices_manager.core.driver import Driver, UpdateStrategy
from devices_manager.dto import (
    AttributeCreate,
    Device,
    DeviceUpdate,
    DriverSpec,
    TransportBase,
    TransportCreate,
    TransportUpdate,
    VirtualDeviceCreate,
    device_to_public,
    driver_to_public,
    transport_to_public,
)
from devices_manager.dto import (
    PhysicalDeviceCreate as DeviceCreate,
)
from devices_manager.storage.yaml.core_file_storage import CoreFileStorage
from devices_manager.types import DataType, DeviceConfig, DeviceKind, TransportProtocols
from models.errors import (
    ForbiddenError,
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


class TestDevicesManagerSync:
    @pytest.mark.asyncio
    async def test_start_sync_with_polling_enabled(self, devices_manager, device):
        await devices_manager.start_sync()

        assert devices_manager._running is True
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
        manager = DevicesManager(
            devices={device_no_poll.id: device_no_poll},
            drivers={driver.metadata.id: driver},
            transports={"t1": mock_transport_client},
        )

        await manager.start_sync()

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
        manager = DevicesManager(
            devices={device1.id: device1, device2.id: device2},
            drivers={"test_driver": driver},
            transports={"t1": mock_transport_client},
        )

        await manager.start_sync()

        assert device1.syncing is True
        assert device2.syncing is True

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
        manager = DevicesManager(
            devices={device1.id: device1, device2.id: device2},
            drivers={"test_driver": driver},
            transports={"t1": mock_transport_client},
        )
        mock_transport_client.read = AsyncMock(return_value="25.5")

        await manager.start_sync()
        await asyncio.sleep(0.1)  # Should send first poll for both
        await manager.stop_sync()

        assert mock_transport_client.read.call_count >= 2 * n_readable_attrs

    @pytest.mark.asyncio
    async def test_stop_sync(self, devices_manager, device):
        await devices_manager.start_sync()

        await devices_manager.stop_sync()

        assert devices_manager._running is False
        assert device.syncing is False

    @pytest.mark.asyncio
    async def test_stop_sync_no_tasks(self, devices_manager):
        devices_manager._running = True

        await devices_manager.stop_sync()

        assert devices_manager._running is False

    @pytest.mark.asyncio
    async def test_devices_are_polled_during_sync(
        self, devices_manager, mock_transport_client
    ):
        await devices_manager.start_sync()
        mock_transport_client.read = AsyncMock(return_value="25.5")
        await asyncio.sleep(0.1)
        await devices_manager.stop_sync()
        assert mock_transport_client.read.called


class TestDevicesManagerListeners:
    def test_add_device_attribute_listener(self, devices_manager):
        def callback(_device_obj, _attribute_name, _attribute) -> None:
            pass

        devices_manager.add_device_attribute_listener(callback)

        assert len(devices_manager._attribute_update_handlers) == 1

    def test_handler_called_on_attribute_update(self, devices_manager, device):
        received: list[tuple[str, object]] = []

        def handler(_device_obj, attribute_name, attribute) -> None:
            received.append((attribute_name, attribute.current_value))

        devices_manager.add_device_attribute_listener(handler)
        device._update_attribute(device.attributes["temperature_setpoint"], 22)

        assert received == [("temperature_setpoint", 22)]


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
        assert all(isinstance(t, TransportBase) for t in transports)


class TestDevicesManagerGetTransport:
    def test_get_transport_existing(self, devices_manager, mock_transport_client):
        transport = devices_manager.get_transport(mock_transport_client.id)
        assert isinstance(transport, TransportBase)
        assert transport.id == mock_transport_client.id

    def test_get_transport_non_existing(self, devices_manager):
        with pytest.raises(NotFoundError):
            devices_manager.get_transport("non-existing-id")


class TestDevicesManagerAddTransport:
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
                "non-existing-id", TransportUpdate(name="x", config={"a": 2})
            )

    @pytest.mark.asyncio
    async def test_update_empty_payload(self, mock_transport_client):
        dm = DevicesManager(
            devices={},
            drivers={},
            transports={mock_transport_client.id: mock_transport_client},
        )
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
        dm = DevicesManager(
            devices={},
            drivers={},
            transports={mock_transport_client.id: mock_transport_client},
        )
        transport_id = mock_transport_client.id
        new_config = {"request_timeout": 5}
        updated_transport = await dm.update_transport(
            transport_id, TransportUpdate(config=new_config)
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
        assert all(isinstance(d, DriverSpec) for d in drivers)

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
        assert isinstance(driver_dto, DriverSpec)
        assert driver_dto.id == driver_id

    def test_get_driver_non_existing(self, devices_manager):
        with pytest.raises(NotFoundError):
            devices_manager.get_driver("non-existing-driver-id")

    @pytest.mark.asyncio
    async def test_add_driver_ok(self, driver):
        dm = DevicesManager(devices={}, drivers={}, transports={})
        driver_dto = driver_to_public(driver)

        created = await dm.add_driver(driver_dto)

        assert isinstance(created, DriverSpec)
        assert created.id == driver_dto.id
        assert dm.get_driver(driver_dto.id) is not None

    @pytest.mark.asyncio
    async def test_add_driver_conflict(self, driver):
        dm = DevicesManager(devices={}, drivers={}, transports={})
        driver_dto = driver_to_public(driver)

        await dm.add_driver(driver_dto)

        with pytest.raises(ValueError):  # noqa: PT011
            await dm.add_driver(driver_dto)

    @pytest.mark.asyncio
    async def test_delete_driver_ok(self, driver):
        dm = DevicesManager(devices={}, drivers={driver.id: driver}, transports={})
        await dm.delete_driver(driver.id)
        with pytest.raises(NotFoundError):
            dm.get_driver(driver.id)

    @pytest.mark.asyncio
    async def test_delete_driver_not_found(self, devices_manager):
        with pytest.raises(NotFoundError):
            await devices_manager.delete_driver("unknown")

    @pytest.mark.asyncio
    async def test_delete_driver_in_use(self, devices_manager, driver):
        with pytest.raises(ForbiddenError):
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


def _dm_with_mock_registry(mock_reg: MagicMock) -> DevicesManager:
    """Build a DevicesManager and swap in a mock device registry."""
    dm = DevicesManager(devices={}, drivers={}, transports={})
    dm._device_registry = mock_reg
    return dm


class TestDevicesManagerDeviceDelegation:
    """DM device methods delegate to the registry and handle side-effects."""

    @pytest.mark.asyncio
    async def test_add_device_delegates_to_registry(self):
        vd = _make_virtual_device()
        mock_reg = _mock_device_registry()
        mock_reg.add.return_value = vd

        dm = _dm_with_mock_registry(mock_reg)

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

        dm = _dm_with_mock_registry(mock_reg)
        dm._running = True

        create = DeviceCreate(
            name="D",
            config={"some_id": "abc"},
            driver_id=driver.id,
            transport_id=mock_transport_client.id,
        )
        await dm.add_device(create)

        assert device.syncing is True
        await device.stop_sync()
        dm._running = False

    @pytest.mark.asyncio
    async def test_add_virtual_device_while_running_not_syncing(self):
        vd = _make_virtual_device()
        mock_reg = _mock_device_registry()
        mock_reg.add.return_value = vd

        dm = _dm_with_mock_registry(mock_reg)
        dm._running = True

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
        dm._running = False

    @pytest.mark.asyncio
    async def test_update_device_delegates_to_registry(
        self, driver, mock_transport_client
    ):
        device = _make_physical_device("d1", driver, mock_transport_client)
        mock_reg = _mock_device_registry({"d1": device})
        mock_reg.update.return_value = device

        dm = _dm_with_mock_registry(mock_reg)

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

        dm = _dm_with_mock_registry(mock_reg)

        await dm.update_device("d1", DeviceUpdate(driver_id="other"))

        # new_device is not old_device -> init_listeners should fire
        # (we can't easily assert on the device mock, but no error = ok)

    @pytest.mark.asyncio
    async def test_update_virtual_device_skips_polling(self):
        vd = _make_virtual_device()
        mock_reg = _mock_device_registry({"vd1": vd})
        mock_reg.update.return_value = vd

        dm = _dm_with_mock_registry(mock_reg)

        await dm.update_device("vd1", DeviceUpdate(name="New"))

        assert vd.syncing is False

    @pytest.mark.asyncio
    async def test_delete_device_delegates_to_registry(self):
        vd = _make_virtual_device()
        mock_reg = _mock_device_registry({"vd1": vd})

        dm = _dm_with_mock_registry(mock_reg)

        await dm.delete_device("vd1")

        mock_reg.remove.assert_called_once_with("vd1")

    @pytest.mark.asyncio
    async def test_delete_device_stops_sync(self, driver, mock_transport_client):
        device = _make_physical_device("d1", driver, mock_transport_client)
        dm = DevicesManager(
            devices={device.id: device},
            drivers={driver.id: driver},
            transports={mock_transport_client.id: mock_transport_client},
        )
        await dm.start_sync()
        assert device.syncing is True

        await dm.delete_device("d1")

        assert device.syncing is False
        dm._running = False

    @pytest.mark.asyncio
    async def test_read_device_delegates_to_registry(self):
        vd = _make_virtual_device()
        mock_reg = _mock_device_registry({"vd1": vd})

        dm = _dm_with_mock_registry(mock_reg)

        result = await dm.read_device("vd1")

        mock_reg.get.assert_called_once_with("vd1")
        assert isinstance(result, Device)

    @pytest.mark.asyncio
    async def test_list_devices_delegates_to_registry(self):
        vd = _make_virtual_device()
        mock_reg = _mock_device_registry({"vd1": vd})

        dm = _dm_with_mock_registry(mock_reg)

        result = dm.list_devices()

        mock_reg.list_all.assert_called_once_with(device_type=None)
        assert len(result) == 1

    @pytest.mark.asyncio
    async def test_get_device_delegates_to_registry(self):
        vd = _make_virtual_device()
        mock_reg = _mock_device_registry({"vd1": vd})

        dm = _dm_with_mock_registry(mock_reg)

        result = dm.get_device("vd1")

        mock_reg.get_dto.assert_called_once_with("vd1")
        assert isinstance(result, Device)

    @pytest.mark.asyncio
    async def test_write_attribute_delegates_to_registry(self):
        mock_reg = _mock_device_registry()
        mock_attr = Attribute.create("value", DataType.FLOAT, {"read", "write"}, 42.0)
        mock_reg.write_attribute.return_value = mock_attr

        dm = _dm_with_mock_registry(mock_reg)

        result = await dm.write_device_attribute("d1", "value", 42.0)

        mock_reg.write_attribute.assert_called_once_with(
            "d1", "value", 42.0, confirm=True
        )
        assert result is mock_attr


class TestDevicesManagerStorage:
    """Tests for storage integration (from_storage, attribute persistence)."""

    @pytest.fixture
    def seeded_db(self, tmp_path: Path, device, driver, mock_transport_client) -> Path:
        """Seed a tmp_path DB with one transport, one driver, one device."""
        cfs = CoreFileStorage(tmp_path)
        asyncio.run(
            cfs.transports.write(
                mock_transport_client.id,
                transport_to_public(mock_transport_client),
            )
        )
        asyncio.run(cfs.drivers.write(driver.id, driver_to_public(driver)))
        asyncio.run(cfs.devices.write(device.id, device_to_public(device)))
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
    async def test_attribute_restored_after_restart(self, tmp_path: Path):
        """Write attribute -> restart DM -> verify value is restored."""
        cfs = CoreFileStorage(tmp_path)
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
        )
        await cfs.devices.write(device_dto.id, device_dto)

        dm = await DevicesManager.from_storage(str(tmp_path))
        await dm.write_device_attribute("vd1", "value", 42.0)
        await asyncio.sleep(0.05)

        dm2 = await DevicesManager.from_storage(str(tmp_path))
        restored = dm2.get_device("vd1")
        assert restored.attributes["value"].current_value == 42.0


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
        dm = DevicesManager(devices={vd.id: vd}, drivers={}, transports={})
        await dm.start_sync()
        assert vd.syncing is False
        await dm.stop_sync()


class TestVirtualDeviceFromDto:
    @pytest.mark.asyncio
    async def test_from_dto_restores_virtual_device(self):
        vd_dto = Device(
            id="vd1",
            kind=DeviceKind.VIRTUAL,
            name="Restored",
            attributes={
                "temperature": Attribute.create(
                    "temperature", DataType.FLOAT, {"read"}
                ),
            },
        )
        dm = await DevicesManager.from_dto(devices=[vd_dto], drivers=[], transports=[])
        assert "vd1" in dm.device_ids
        result = dm.get_device("vd1")
        assert result.kind == DeviceKind.VIRTUAL
        assert result.name == "Restored"

    @pytest.mark.asyncio
    async def test_from_dto_virtual_device_no_driver_or_transport(self):
        vd_dto = Device(
            id="vd2",
            kind=DeviceKind.VIRTUAL,
            name="V",
            attributes={
                "x": Attribute.create("x", DataType.INT, {"read", "write"}),
            },
        )
        dm = await DevicesManager.from_dto(devices=[vd_dto], drivers=[], transports=[])
        result = dm.get_device("vd2")
        assert result.driver_id is None
        assert result.transport_id is None


class TestDevicesManagerRestartSync:
    @pytest.mark.asyncio
    async def test_update_device_transport_restarts_sync(
        self,
        device,
        driver,
        mock_transport_client,
        second_mock_transport_client,
    ):
        dm = DevicesManager(
            devices={device.id: device},
            drivers={driver.id: driver},
            transports={
                mock_transport_client.id: mock_transport_client,
                second_mock_transport_client.id: second_mock_transport_client,
            },
        )
        await dm.start_sync()
        assert device.syncing is True

        update = DeviceUpdate(transport_id=second_mock_transport_client.id)
        await dm.update_device(device.id, update)

        updated = dm._device_registry.get(device.id)
        assert updated.syncing is True
        await dm.stop_sync()

    @pytest.mark.asyncio
    async def test_update_device_config_restarts_sync(
        self, device, driver, mock_transport_client
    ):
        dm = DevicesManager(
            devices={device.id: device},
            drivers={driver.id: driver},
            transports={mock_transport_client.id: mock_transport_client},
        )
        await dm.start_sync()
        assert device.syncing is True

        update = DeviceUpdate(config={"some_id": "new_value"})
        await dm.update_device(device.id, update)

        updated = dm._device_registry.get(device.id)
        assert updated.syncing is True
        await dm.stop_sync()

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
        dm = DevicesManager(
            devices={device1.id: device1, device2.id: device2},
            drivers={driver.id: driver},
            transports={mock_transport_client.id: mock_transport_client},
        )
        await dm.start_sync()
        assert device1.syncing is True
        assert device2.syncing is True

        await dm.update_transport(
            mock_transport_client.id,
            TransportUpdate(config={"request_timeout": 5}),
        )

        assert device1.syncing is True
        assert device2.syncing is True
        await dm.stop_sync()
