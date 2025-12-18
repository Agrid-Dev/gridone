import asyncio
from collections.abc import Callable
from unittest.mock import AsyncMock, MagicMock, Mock, patch

import pytest
from core.device import Device
from core.devices_manager import DevicesManager, DeviceRaw, DriverRaw, TransportConfigRaw
from core.driver import Driver
from core.driver.driver_schema import DriverSchema
from core.driver.driver_schema.attribute_schema import AttributeSchema
from core.driver.driver_schema.update_strategy import UpdateStrategy
from core.transports import TransportClient
from core.transports.transport_address import TransportAddress
from core.transports.transport_client_registry import TransportClientRegistry
from core.types import AttributeValueType, DataType, TransportProtocols
from core.value_adapters.factory import ValueAdapterSpec


class MockTransportAddress(TransportAddress):
    def __init__(self, address: str) -> None:
        self.address = address

    @property
    def id(self) -> str:
        return self.address

    @classmethod
    def from_str(
        cls, address_str: str, extra_context: dict | None = None
    ) -> "MockTransportAddress":
        return cls(address_str)

    @classmethod
    def from_dict(
        cls, address_dict: dict, extra_context: dict | None = None
    ) -> "MockTransportAddress":
        return cls(str(address_dict))

    @classmethod
    def from_raw(
        cls, raw_address: str | dict, extra_context: dict | None = None
    ) -> "MockTransportAddress":
        if isinstance(raw_address, str):
            return cls(raw_address)
        return cls(str(raw_address))


class MockTransportClient(TransportClient[MockTransportAddress]):
    protocol = TransportProtocols.HTTP
    address_builder = MockTransportAddress

    def __init__(self):
        self._read_handlers: dict[str, Callable] = {}
        self._listen_handlers: dict[str, tuple[str, Callable]] = {}
        self._handler_counter = 0
        self._is_connected = False

    def build_address(self, raw_address, context):
        if isinstance(raw_address, str):
            return MockTransportAddress(raw_address.format(**context))
        return MockTransportAddress(str(raw_address))

    async def read(self, address: MockTransportAddress):
        handler = self._read_handlers.get(address.address)
        if handler:
            return handler()
        return "default_value"

    async def write(self, address: MockTransportAddress, value):
        pass

    def register_read_handler(self, address: MockTransportAddress, handler: Callable):
        self._read_handlers[address.address] = handler

    def listen(self, topic_or_address: str | MockTransportAddress, handler: Callable) -> str:
        topic = topic_or_address if isinstance(topic_or_address, str) else topic_or_address.address
        handler_id = f"handler_{self._handler_counter}"
        self._handler_counter += 1
        self._listen_handlers[handler_id] = (topic, handler)
        return handler_id

    def unlisten(self, handler_id: str, topic_or_address: str | MockTransportAddress | None = None):
        if handler_id in self._listen_handlers:
            del self._listen_handlers[handler_id]

    async def connect(self):
        self._is_connected = True

    async def close(self):
        self._is_connected = False


@pytest.fixture
def mock_transport():
    return MockTransportClient()


@pytest.fixture
def simple_driver_schema():
    return DriverSchema(
        name="test_driver",
        transport=TransportProtocols.HTTP,
        update_strategy=UpdateStrategy(polling_enabled=True, polling_interval=1),
        device_config_fields=[],
        attribute_schemas=[
            AttributeSchema(
                name="temperature",
                data_type=DataType.FLOAT,
                read="GET /temperature",
                write=None,
                value_adapter=[ValueAdapterSpec(adapter="identity", argument="")],
            ),
        ],
        discovery=None,
    )


@pytest.fixture
def driver_without_polling():
    return DriverSchema(
        name="test_driver_no_poll",
        transport=TransportProtocols.HTTP,
        update_strategy=UpdateStrategy(polling_enabled=False),
        device_config_fields=[],
        attribute_schemas=[
            AttributeSchema(
                name="temperature",
                data_type=DataType.FLOAT,
                read="GET /temperature",
                write=None,
                value_adapter=[ValueAdapterSpec(adapter="identity", argument="")],
            ),
        ],
        discovery=None,
    )


@pytest.fixture
def driver(mock_transport, simple_driver_schema):
    return Driver(
        name="test_driver",
        env={},
        transport=mock_transport,
        schema=simple_driver_schema,
    )


@pytest.fixture
def device(driver):
    return Device.from_driver(driver, {"device_id": "device1"}, device_id="device1")


@pytest.fixture
def devices_manager(device, driver):
    return DevicesManager(
        devices={"device1": device},
        drivers={"test_driver": driver},
    )


class TestDevicesManagerInit:
    def test_init(self):
        manager = DevicesManager(devices={}, drivers={})

        assert manager.devices == {}
        assert manager.drivers == {}
        assert manager._background_tasks == set()
        assert manager._running is False
        assert manager._attribute_listeners == []
        assert isinstance(manager.transport_registry, TransportClientRegistry)


class TestDevicesManagerPolling:
    @pytest.mark.asyncio
    async def test_start_polling_with_polling_enabled(self, devices_manager, device):
        devices_manager.devices = {"device1": device}

        await devices_manager.start_polling()

        assert devices_manager._running is True
        assert len(devices_manager._background_tasks) == 1

    @pytest.mark.asyncio
    async def test_start_polling_without_polling_enabled(self, mock_transport, driver_without_polling):
        driver_no_poll = Driver(
            name="test_driver_no_poll",
            env={},
            transport=mock_transport,
            schema=driver_without_polling,
        )
        device_no_poll = Device.from_driver(
            driver_no_poll, {"device_id": "device1"}, device_id="device1"
        )
        manager = DevicesManager(
            devices={"device1": device_no_poll},
            drivers={"test_driver_no_poll": driver_no_poll},
        )

        await manager.start_polling()

        # _running is only set to True if there are devices with polling enabled
        assert manager._running is False
        assert len(manager._background_tasks) == 0

    @pytest.mark.asyncio
    async def test_start_polling_multiple_devices(self, mock_transport, simple_driver_schema):
        driver1 = Driver(
            name="test_driver",
            env={},
            transport=mock_transport,
            schema=simple_driver_schema,
        )
        driver2 = Driver(
            name="test_driver",
            env={},
            transport=mock_transport,
            schema=simple_driver_schema,
        )
        device1 = Device.from_driver(driver1, {"device_id": "device1"}, device_id="device1")
        device2 = Device.from_driver(driver2, {"device_id": "device2"}, device_id="device2")
        manager = DevicesManager(
            devices={"device1": device1, "device2": device2},
            drivers={"test_driver": driver1},
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
    async def test_device_poll_loop(self, devices_manager, device, mock_transport):
        devices_manager.devices = {"device1": device}
        devices_manager._running = True
        mock_transport.read = AsyncMock(return_value="25.5")

        task = asyncio.create_task(devices_manager._device_poll_loop(device))
        devices_manager._background_tasks.add(task)

        await asyncio.sleep(0.1)

        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

        assert mock_transport.read.called

    @pytest.mark.asyncio
    async def test_device_poll_loop_cancelled(self, devices_manager, device):
        devices_manager._running = True

        task = asyncio.create_task(devices_manager._device_poll_loop(device))
        task.cancel()

        try:
            await task
        except asyncio.CancelledError:
            pass

        assert task.cancelled()


class TestDevicesManagerLoadFromRaw:
    @pytest.mark.asyncio
    async def test_load_from_raw_success(self, mock_transport):
        devices_raw: list[DeviceRaw] = [
            {
                "id": "device1",
                "driver": "test_driver",
                "transport_config": "config1",
                "config": {"device_id": "device1"},
            },
        ]
        drivers_raw: list[DriverRaw] = [
            {
                "name": "test_driver",
                "transport": "http",
                "device_config": [],
                "attributes": [
                    {
                        "name": "temperature",
                        "data_type": "float",
                        "read": "GET /temperature",
                    },
                ],
            },
        ]
        transport_configs: list[TransportConfigRaw] = [
            {"name": "config1"},
        ]

        with patch(
            "core.devices_manager.TransportClientRegistry"
        ) as mock_registry_class:
            mock_registry = MagicMock()
            mock_registry.get_transport.return_value = mock_transport
            mock_registry_class.return_value = mock_registry

            manager = DevicesManager.load_from_raw(
                devices_raw, drivers_raw, transport_configs
            )

            assert len(manager.devices) == 1
            assert "device1" in manager.devices
            assert len(manager.drivers) == 1
            assert "test_driver" in manager.drivers

    @pytest.mark.asyncio
    async def test_load_from_raw_multiple_devices(self, mock_transport):
        devices_raw: list[DeviceRaw] = [
            {
                "id": "device1",
                "driver": "test_driver",
                "transport_config": "config1",
                "config": {"device_id": "device1"},
            },
            {
                "id": "device2",
                "driver": "test_driver",
                "transport_config": "config1",
                "config": {"device_id": "device2"},
            },
        ]
        drivers_raw: list[DriverRaw] = [
            {
                "name": "test_driver",
                "transport": "http",
                "device_config": [],
                "attributes": [
                    {
                        "name": "temperature",
                        "data_type": "float",
                        "read": "GET /temperature",
                    },
                ],
            },
        ]
        transport_configs: list[TransportConfigRaw] = [
            {"name": "config1"},
        ]

        with patch(
            "core.devices_manager.TransportClientRegistry"
        ) as mock_registry_class:
            mock_registry = MagicMock()
            mock_registry.get_transport.return_value = mock_transport
            mock_registry_class.return_value = mock_registry

            manager = DevicesManager.load_from_raw(
                devices_raw, drivers_raw, transport_configs
            )

            assert len(manager.devices) == 2
            assert len(manager.drivers) == 1

    @pytest.mark.asyncio
    async def test_load_from_raw_no_transport_config(self, mock_transport):
        devices_raw: list[DeviceRaw] = [
            {
                "id": "device1",
                "driver": "test_driver",
                "transport_config": "",
                "config": {"device_id": "device1"},
            },
        ]
        drivers_raw: list[DriverRaw] = [
            {
                "name": "test_driver",
                "transport": "http",
                "device_config": [],
                "attributes": [
                    {
                        "name": "temperature",
                        "data_type": "float",
                        "read": "GET /temperature",
                    },
                ],
            },
        ]
        transport_configs: list[TransportConfigRaw] = []

        with patch(
            "core.devices_manager.TransportClientRegistry"
        ) as mock_registry_class:
            mock_registry = MagicMock()
            mock_registry.get_transport.return_value = mock_transport
            mock_registry_class.return_value = mock_registry

            manager = DevicesManager.load_from_raw(
                devices_raw, drivers_raw, transport_configs
            )

            assert len(manager.devices) == 1


class TestDevicesManagerBuildDevice:
    def test_build_device_success(self, mock_transport):
        device_raw: DeviceRaw = {
            "id": "device1",
            "driver": "test_driver",
            "transport_config": "config1",
            "config": {"device_id": "device1"},
        }
        driver_raw: DriverRaw = {
            "name": "test_driver",
            "transport": "http",
            "device_config": [],
            "attributes": [
                {
                    "name": "temperature",
                    "data_type": "float",
                    "read": "GET /temperature",
                },
            ],
        }
        transport_config: TransportConfigRaw = {"name": "config1"}

        with patch(
            "core.devices_manager.TransportClientRegistry"
        ) as mock_registry_class:
            mock_registry = MagicMock()
            mock_registry.get_transport.return_value = mock_transport
            mock_registry_class.return_value = mock_registry

            device = DevicesManager.build_device(device_raw, driver_raw, transport_config)

            assert device.id == "device1"
            assert device.driver.name == "test_driver"

    def test_build_device_no_transport_config(self, mock_transport):
        device_raw: DeviceRaw = {
            "id": "device1",
            "driver": "test_driver",
            "transport_config": "",
            "config": {"device_id": "device1"},
        }
        driver_raw: DriverRaw = {
            "name": "test_driver",
            "transport": "http",
            "device_config": [],
            "attributes": [
                {
                    "name": "temperature",
                    "data_type": "float",
                    "read": "GET /temperature",
                },
            ],
        }

        with patch(
            "core.devices_manager.TransportClientRegistry"
        ) as mock_registry_class:
            mock_registry = MagicMock()
            mock_registry.get_transport.return_value = mock_transport
            mock_registry_class.return_value = mock_registry

            device = DevicesManager.build_device(device_raw, driver_raw, None)

            assert device.id == "device1"


class TestDevicesManagerAddDevice:
    @pytest.mark.asyncio
    async def test_add_device_success(self, devices_manager, mock_transport):
        device_raw: DeviceRaw = {
            "id": "device2",
            "driver": "test_driver",
            "transport_config": "config1",
            "config": {"device_id": "device2"},
        }
        drivers_raw: list[DriverRaw] = [
            {
                "name": "test_driver",
                "transport": "http",
            },
        ]
        transport_configs: list[TransportConfigRaw] = [
            {"name": "config1"},
        ]

        with patch.object(
            devices_manager.transport_registry, "get_transport", return_value=mock_transport
        ):
            device = devices_manager.add_device(device_raw, drivers_raw, transport_configs)

            assert device.id == "device2"
            assert "device2" in devices_manager.devices
            assert len(devices_manager.devices) == 2

    @pytest.mark.asyncio
    async def test_add_device_with_initial_attributes(self, devices_manager, mock_transport):
        device_raw: DeviceRaw = {
            "id": "device2",
            "driver": "test_driver",
            "transport_config": "config1",
            "config": {"device_id": "device2"},
        }
        drivers_raw: list[DriverRaw] = [
            {
                "name": "test_driver",
                "transport": "http",
            },
        ]
        transport_configs: list[TransportConfigRaw] = [
            {"name": "config1"},
        ]
        initial_attributes: dict[str, AttributeValueType] = {"temperature": 25.5}

        with patch.object(
            devices_manager.transport_registry, "get_transport", return_value=mock_transport
        ):
            device = devices_manager.add_device(
                device_raw, drivers_raw, transport_configs, initial_attributes
            )

            assert device.get_attribute_value("temperature") == 25.5

    @pytest.mark.asyncio
    async def test_add_device_reuses_existing_driver(self, devices_manager, driver, mock_transport):
        device_raw: DeviceRaw = {
            "id": "device2",
            "driver": "test_driver",
            "transport_config": "config1",
            "config": {"device_id": "device2"},
        }
        drivers_raw: list[DriverRaw] = [
            {
                "name": "test_driver",
                "transport": "http",
            },
        ]
        transport_configs: list[TransportConfigRaw] = [
            {"name": "config1"},
        ]

        with patch.object(
            devices_manager.transport_registry, "get_transport", return_value=mock_transport
        ):
            device = devices_manager.add_device(device_raw, drivers_raw, transport_configs)

            assert devices_manager.drivers["test_driver"] is driver

    @pytest.mark.asyncio
    async def test_add_device_starts_polling_if_running(self, devices_manager, mock_transport, simple_driver_schema):
        devices_manager._running = True
        device_raw: DeviceRaw = {
            "id": "device2",
            "driver": "test_driver",
            "transport_config": "config1",
            "config": {"device_id": "device2"},
        }
        drivers_raw: list[DriverRaw] = [
            {
                "name": "test_driver",
                "transport": "http",
            },
        ]
        transport_configs: list[TransportConfigRaw] = [
            {"name": "config1"},
        ]

        with patch.object(
            devices_manager.transport_registry, "get_transport", return_value=mock_transport
        ):
            device = devices_manager.add_device(device_raw, drivers_raw, transport_configs)

            assert len(devices_manager._background_tasks) == 1

            await devices_manager.stop_polling()

    @pytest.mark.asyncio
    async def test_add_device_invalid_attribute_value(self, devices_manager, mock_transport, caplog):
        device_raw: DeviceRaw = {
            "id": "device2",
            "driver": "test_driver",
            "transport_config": "config1",
            "config": {"device_id": "device2"},
        }
        drivers_raw: list[DriverRaw] = [
            {
                "name": "test_driver",
                "transport": "http",
            },
        ]
        transport_configs: list[TransportConfigRaw] = [
            {"name": "config1"},
        ]
        initial_attributes: dict[str, AttributeValueType] = {"invalid_attr": "value"}

        with patch.object(
            devices_manager.transport_registry, "get_transport", return_value=mock_transport
        ):
            device = devices_manager.add_device(
                device_raw, drivers_raw, transport_configs, initial_attributes
            )

            assert device.id == "device2"
            # Should handle invalid attribute gracefully


class TestDevicesManagerListeners:
    def test_add_device_attribute_listener(self, devices_manager, device):
        callback_called = False

        def callback(device_obj, attribute_name, attribute):
            nonlocal callback_called
            callback_called = True

        devices_manager.add_device_attribute_listener(callback)

        assert len(devices_manager._attribute_listeners) == 1
        assert callback in device._update_listeners

    def test_add_device_attribute_listener_multiple_devices(self, devices_manager, mock_transport, simple_driver_schema):
        driver1 = Driver(
            name="test_driver",
            env={},
            transport=mock_transport,
            schema=simple_driver_schema,
        )
        driver2 = Driver(
            name="test_driver",
            env={},
            transport=mock_transport,
            schema=simple_driver_schema,
        )
        device1 = Device.from_driver(driver1, {"device_id": "device1"}, device_id="device1")
        device2 = Device.from_driver(driver2, {"device_id": "device2"}, device_id="device2")
        devices_manager.devices = {"device1": device1, "device2": device2}

        callback_called_count = 0

        def callback(device_obj, attribute_name, attribute):
            nonlocal callback_called_count
            callback_called_count += 1

        devices_manager.add_device_attribute_listener(callback)

        assert callback in device1._update_listeners
        assert callback in device2._update_listeners

    def test_attach_listeners(self, devices_manager, device, mock_transport, simple_driver_schema):
        callback_called = False

        def callback(device_obj, attribute_name, attribute):
            nonlocal callback_called
            callback_called = True

        devices_manager.add_device_attribute_listener(callback)

        new_driver = Driver(
            name="test_driver",
            env={},
            transport=mock_transport,
            schema=simple_driver_schema,
        )
        new_device = Device.from_driver(new_driver, {"device_id": "device2"}, device_id="device2")

        devices_manager._attach_listeners(new_device)

        assert callback in new_device._update_listeners

