from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

import pytest
from core.driver import Driver
from core.driver.driver_schema import DriverSchema
from core.driver.driver_schema.attribute_schema import AttributeSchema
from core.driver.driver_schema.discovery_schema import (
    DiscoveryListenSchema,
    DiscoverySchema,
)
from core.driver.driver_schema.driver_schema import DeviceConfigField
from core.driver.driver_schema.update_strategy import UpdateStrategy
from core.transports import TransportClient
from core.transports.transport_address import TransportAddress
from core.types import DataType, TransportProtocols
from core.value_adapters.factory import ValueAdapterSpec

if TYPE_CHECKING:
    from collections.abc import Callable


class MockTransportAddress(TransportAddress):
    def __init__(self, address: str) -> None:
        self.address = address

    @property
    def id(self) -> str:
        return self.address

    @classmethod
    def from_str(
        cls,
        address_str: str,
        extra_context: dict | None = None,  # noqa: ARG003
    ) -> "MockTransportAddress":
        return cls(address_str)

    @classmethod
    def from_dict(
        cls,
        address_dict: dict,
        extra_context: dict | None = None,  # noqa: ARG003
    ) -> "MockTransportAddress":
        return cls(str(address_dict))

    @classmethod
    def from_raw(
        cls,
        raw_address: str | dict,
        extra_context: dict | None = None,  # noqa: ARG003
    ) -> "MockTransportAddress":
        if isinstance(raw_address, str):
            return cls(raw_address)
        return cls(str(raw_address))


class MockTransportClient(TransportClient[MockTransportAddress]):
    protocol = TransportProtocols.HTTP
    address_builder = MockTransportAddress

    def __init__(self) -> None:
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

    async def connect(self) -> None:
        self._is_connected = True

    async def close(self) -> None:
        self._is_connected = False


@pytest.fixture
def mock_transport():
    return MockTransportClient()


@pytest.fixture
def simple_driver_schema():
    return DriverSchema(
        name="test_driver",
        transport=TransportProtocols.HTTP,
        update_strategy=UpdateStrategy(),
        device_config_fields=[],
        attribute_schemas=[
            AttributeSchema(
                name="temperature",
                data_type=DataType.FLOAT,
                read="GET /temperature",
                write=None,
                value_adapter=[ValueAdapterSpec(adapter="identity", argument="")],
            ),
            AttributeSchema(
                name="humidity",
                data_type=DataType.FLOAT,
                read="GET /humidity",
                write="POST /humidity",
                value_adapter=[ValueAdapterSpec(adapter="identity", argument="")],
            ),
        ],
        discovery=None,
    )


@pytest.fixture
def driver_with_discovery():
    return DriverSchema(
        name="test_driver",
        transport=TransportProtocols.HTTP,
        update_strategy=UpdateStrategy(),
        device_config_fields=[
            DeviceConfigField(name="device_id", required=True),
            DeviceConfigField(name="location", required=False),
        ],
        attribute_schemas=[
            AttributeSchema(
                name="temperature",
                data_type=DataType.FLOAT,
                read="GET /temperature",
                write=None,
                value_adapter=[
                    ValueAdapterSpec(adapter="json_pointer", argument="/temperature"),
                ],
            ),
        ],
        discovery=DiscoverySchema(
            listen=DiscoveryListenSchema(topic="devices/+/discover"),
            parsers={
                "device_id": {"json_pointer": "/device_id"},
            },
        ),
    )


@pytest.fixture
def driver(mock_transport, simple_driver_schema):
    return Driver(
        name="test_driver",
        env={"base_url": "http://example.com"},
        transport=mock_transport,
        schema=simple_driver_schema,
    )


@pytest.fixture
def driver_w_push_transport(mock_push_transport_client, simple_driver_schema):
    return Driver(
        name="test_driver",
        env={"base_url": "http://example.com"},
        transport=mock_push_transport_client,
        schema=simple_driver_schema,
    )


class TestDriverAttachUpdater:
    @pytest.mark.asyncio
    async def test_attach_updater_success(
        self, driver_w_push_transport, mock_push_transport_client
    ):
        device_config = {"device_id": "device1"}
        callback_called = False
        callback_value = None

        def callback(value) -> None:
            nonlocal callback_called, callback_value
            callback_called = True
            callback_value = value

        listener_id = await driver_w_push_transport.attach_update_listener(
            "temperature", device_config, callback
        )
        # Simulate transport reading a value
        handler = mock_push_transport_client._listener_registry.get_by_id(listener_id)
        assert handler is not None
        handler("25.5")

        assert callback_called
        assert callback_value == "25.5"

    @pytest.mark.asyncio
    async def test_attach_updater_invalid_attribute(self, driver_w_push_transport):
        device_config = {"device_id": "device1"}

        def callback(value) -> None:
            pass

        with pytest.raises(ValueError, match="Attribute invalid_attr is not supported"):
            await driver_w_push_transport.attach_update_listener(
                "invalid_attr", device_config, callback
            )


class TestDriverReadValue:
    @pytest.mark.asyncio
    async def test_read_value_success(self, driver, mock_transport):
        device_config = {"device_id": "device1"}
        mock_transport.read = AsyncMock(return_value="23.5")

        value = await driver.read_value("temperature", device_config)

        assert value == "23.5"
        mock_transport.read.assert_called_once()

    @pytest.mark.asyncio
    async def test_read_value_with_context(self, driver, mock_transport):
        device_config = {"device_id": "device1", "sensor_id": "sensor1"}
        driver.env = {"base_url": "http://api.example.com"}
        mock_transport.read = AsyncMock(return_value="20.0")

        value = await driver.read_value("temperature", device_config)

        assert value == "20.0"


class TestDriverWriteValue:
    @pytest.mark.asyncio
    async def test_write_value_success(self, driver, mock_transport):
        device_config = {"device_id": "device1"}
        mock_transport.write = AsyncMock()

        await driver.write_value("humidity", device_config, 65.0)

        mock_transport.write.assert_called_once()

    @pytest.mark.asyncio
    async def test_write_value_not_writable(self, driver):
        device_config = {"device_id": "device1"}

        with pytest.raises(ValueError, match="Attribute 'temperature' is not writable"):
            await driver.write_value("temperature", device_config, 25.0)

    @pytest.mark.asyncio
    async def test_write_value_with_value_in_context(self, driver, mock_transport):
        device_config = {"device_id": "device1"}
        mock_transport.write = AsyncMock()

        await driver.write_value("humidity", device_config, 70.5)

        mock_transport.write.assert_called_once()


# class TestDriverDiscovery:
#     def test_start_discovery_success(self, mock_transport, driver_with_discovery):
#         driver = Driver(
#             name="test_driver",
#             env={},
#             transport=mock_transport,
#             schema=driver_with_discovery,
#         )
#         device_config = {"location": "room1"}

#         driver.start_discovery(device_config)

#         assert driver._discovery_handler_id is not None
#         assert driver._discovery_device_config == device_config
#         assert len(mock_transport._listen_handlers) == 1

#     def test_start_discovery_no_discovery_config(self, driver):
#         msg = "Driver 'test_driver' does not have discovery configuration"
#         with pytest.raises(ValueError, match=msg):
#             driver.start_discovery()

#     def test_start_discovery_already_started(
#         self, mock_transport, driver_with_discovery, caplog
#     ):
#         driver = Driver(
#             name="test_driver",
#             env={},
#             transport=mock_transport,
#             schema=driver_with_discovery,
#         )
#         driver.start_discovery()
#         handler_id = driver._discovery_handler_id

#         driver.start_discovery()

#         assert driver._discovery_handler_id == handler_id
#         assert "Discovery already started" in caplog.text

#     def test_start_discovery_with_device_config(
#         self, mock_transport, driver_with_discovery
#     ):
#         driver = Driver(
#             name="test_driver",
#             env={"env_var": "value"},
#             transport=mock_transport,
#             schema=driver_with_discovery,
#         )
#         device_config = {"location": "room1"}

#         driver.start_discovery(device_config)

#         assert driver._discovery_device_config == device_config

#     def test_stop_discovery_success(self, mock_transport, driver_with_discovery):
#         driver = Driver(
#             name="test_driver",
#             env={},
#             transport=mock_transport,
#             schema=driver_with_discovery,
#         )
#         driver.start_discovery()
#         handler_id = driver._discovery_handler_id

#         driver.stop_discovery()

#         assert driver._discovery_handler_id is None
#         assert driver._discovery_device_config is None
#         assert handler_id not in mock_transport._listen_handlers

#     def test_stop_discovery_not_started(
#         self, mock_transport, driver_with_discovery, caplog
#     ):
#         driver = Driver(
#             name="test_driver",
#             env={},
#             transport=mock_transport,
#             schema=driver_with_discovery,
#         )

#         driver.stop_discovery()

#         assert "Discovery not started" in caplog.text

#     def test_set_discovery_callback(self, driver):
#         callback_called = False

#         def callback(_device_id, _device_config, _attributes) -> None:
#             nonlocal callback_called
#             callback_called = True

#         driver.set_discovery_callback(callback)

#         assert driver._discovery_callback is not None
#         assert driver._discovery_callback == callback


# class TestDriverHandleDiscoveryMessage:
#     def test_handle_discovery_message_success(
#         self, mock_transport, driver_with_discovery
#     ):
#         callback_called = False
#         callback_args = None

#         def callback(device_id, device_config, attributes) -> None:
#             nonlocal callback_called, callback_args
#             callback_called = True
#             callback_args = (device_id, device_config, attributes)

#         driver = Driver(
#             name="test_driver",
#             env={},
#             transport=mock_transport,
#             schema=driver_with_discovery,
#         )
#         driver.set_discovery_callback(callback)

#         message = json.dumps({"device_id": "device123", "temperature": 25.5})
#         driver._handle_discovery_message(message, {})

#         assert callback_called
#         assert callback_args[0] == "device123"

#     def test_handle_discovery_message_invalid_json(
#         self, mock_transport, driver_with_discovery, caplog
#     ):
#         driver = Driver(
#             name="test_driver",
#             env={},
#             transport=mock_transport,
#             schema=driver_with_discovery,
#         )

#         driver._handle_discovery_message("invalid json", {})

#         assert "Failed to parse discovery message" in caplog.text

#     def test_handle_discovery_message_missing_device_id(
#         self, mock_transport, driver_with_discovery, caplog
#     ):
#         driver = Driver(
#             name="test_driver",
#             env={},
#             transport=mock_transport,
#             schema=driver_with_discovery,
#         )

#         message = json.dumps({"temperature": 25.5})
#         driver._handle_discovery_message(message, {})

#         assert "missing required 'device_id' field" in caplog.text

#     def test_handle_discovery_message_no_matching_attributes(
#         self, mock_transport, driver_with_discovery, caplog
#     ):
#         driver = Driver(
#             name="test_driver",
#             env={},
#             transport=mock_transport,
#             schema=driver_with_discovery,
#         )

#         message = json.dumps({"device_id": "device123", "other_field": "value"})
#         driver._handle_discovery_message(message, {})

#         assert "attributes do not match" in caplog.text or not caplog.text

#     def test_handle_discovery_message_parser_error(
#         self, mock_transport, driver_with_discovery
#     ):
#         driver = Driver(
#             name="test_driver",
#             env={},
#             transport=mock_transport,
#             schema=driver_with_discovery,
#         )

#         message = json.dumps({"device_id": "device123"})
#         driver._handle_discovery_message(message, {})

#         # Should handle parser errors gracefully
#         assert True  # Test passes if no exception is raised

#     def test_handle_discovery_message_callback_exception(
#         self, mock_transport, driver_with_discovery, caplog
#     ):
#         def callback(_device_id, _device_config, _attributes) -> None:
#             msg = "Callback error"
#             raise ValueError(msg)

#         driver = Driver(
#             name="test_driver",
#             env={},
#             transport=mock_transport,
#             schema=driver_with_discovery,
#         )
#         driver.set_discovery_callback(callback)

#         message = json.dumps({"device_id": "device123", "temperature": 25.5})
#         driver._handle_discovery_message(message, {})

#         assert "Error in discovery callback" in caplog.text


# class TestDriverExtractAttributesFromMessage:
#     def test_extract_attributes_from_message_success(
#         self, mock_transport, driver_with_discovery
#     ):
#         driver = Driver(
#             name="test_driver",
#             env={},
#             transport=mock_transport,
#             schema=driver_with_discovery,
#         )

#         message_data = {"temperature": 25.5}
#         attributes = driver._extract_attributes_from_message(message_data)

#         assert "temperature" in attributes
#         assert attributes["temperature"] == 25.5

#     def test_extract_attributes_from_message_no_json_pointer(
#         self, mock_transport, simple_driver_schema
#     ):
#         driver = Driver(
#             name="test_driver",
#             env={},
#             transport=mock_transport,
#             schema=simple_driver_schema,
#         )

#         message_data = {"temperature": 25.5}
#         attributes = driver._extract_attributes_from_message(message_data)

#         assert len(attributes) == 0

#     def test_extract_attributes_from_message_missing_attribute(
#         self, mock_transport, driver_with_discovery
#     ):
#         driver = Driver(
#             name="test_driver",
#             env={},
#             transport=mock_transport,
#             schema=driver_with_discovery,
#         )

#         message_data = {"other_field": "value"}
#         attributes = driver._extract_attributes_from_message(message_data)

#         assert len(attributes) == 0


# class TestDriverAttributesMatch:
#     def test_attributes_match_success(self, driver):
#         discovered_attributes = {"temperature": 25.5, "humidity": 60.0}

#         assert driver._attributes_match(discovered_attributes) is True

#     def test_attributes_match_no_attributes(self, driver):
#         discovered_attributes = {}

#         assert driver._attributes_match(discovered_attributes) is False

#     def test_attributes_match_no_matching(self, driver):
#         discovered_attributes = {"other_attr": "value"}

#         assert driver._attributes_match(discovered_attributes) is False

#     def test_attributes_match_partial_match(self, driver):
#         discovered_attributes = {"temperature": 25.5, "other_attr": "value"}

#         assert driver._attributes_match(discovered_attributes) is True


# class TestDriverExtractDeviceConfig:
#     def test_extract_device_config_from_parsers(
#         self, mock_transport, driver_with_discovery
#     ):
#         driver = Driver(
#             name="test_driver",
#             env={},
#             transport=mock_transport,
#             schema=driver_with_discovery,
#         )

#         message_data = {}
#         discovered_fields = {"device_id": "device123", "location": "room1"}

#         device_config = driver._extract_device_config(message_data, discovered_fields)

#         assert device_config is not None
#         assert device_config["device_id"] == "device123"
#         assert device_config["location"] == "room1"

#     def test_extract_device_config_from_message_data(
#         self, mock_transport, driver_with_discovery
#     ):
#         driver = Driver(
#             name="test_driver",
#             env={},
#             transport=mock_transport,
#             schema=driver_with_discovery,
#         )

#         message_data = {"device_id": "device123", "location": "room1"}
#         discovered_fields = {}

#         device_config = driver._extract_device_config(message_data, discovered_fields)

#         assert device_config is not None
#         assert device_config["device_id"] == "device123"

#     def test_extract_device_config_from_payload(
#         self, mock_transport, driver_with_discovery
#     ):
#         driver = Driver(
#             name="test_driver",
#             env={},
#             transport=mock_transport,
#             schema=driver_with_discovery,
#         )

#         message_data = {"payload": {"device_id": "device123"}}
#         discovered_fields = {}

#         device_config = driver._extract_device_config(message_data, discovered_fields)

#         assert device_config is not None
#         assert device_config["device_id"] == "device123"

#     def test_extract_device_config_missing_required_field(
#         self, mock_transport, driver_with_discovery, caplog
#     ):
#         driver = Driver(
#             name="test_driver",
#             env={},
#             transport=mock_transport,
#             schema=driver_with_discovery,
#         )

#         message_data = {}
#         discovered_fields = {}

#         device_config = driver._extract_device_config(message_data, discovered_fields)

#         assert device_config is None
#         assert "Required device_config field 'device_id' not found" in caplog.text


class TestDriverFromDict:
    def test_from_dict_success(self, mock_transport):
        data = {
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

        driver = Driver.from_dict(data, mock_transport)

        assert driver.name == "test_driver"
        assert driver.transport == mock_transport
        assert len(driver.schema.attribute_schemas) == 1

    def test_from_dict_wrong_transport(self, mock_transport):
        data = {
            "name": "test_driver",
            "transport": "mqtt",
            "device_config": [],
            "attributes": [],
        }

        msg = "Expected a mqtt transport but got http"
        with pytest.raises(ValueError, match=msg):
            Driver.from_dict(data, mock_transport)

    def test_from_dict_with_env(self, mock_transport):
        data = {
            "name": "test_driver",
            "transport": "http",
            "env": {"key": "value"},
            "device_config": [],
            "attributes": [],
        }

        driver = Driver.from_dict(data, mock_transport)

        assert driver.env == {"key": "value"}

    def test_from_dict_empty_env(self, mock_transport):
        data = {
            "name": "test_driver",
            "transport": "http",
            "env": None,
            "device_config": [],
            "attributes": [],
        }

        driver = Driver.from_dict(data, mock_transport)

        assert driver.env == {}

    def test_from_dict_missing_name(self, mock_transport):
        data = {
            "transport": "http",
            "device_config": [],
            "attributes": [],
        }

        # DriverSchema.from_dict requires "name" field, so this should fail
        with pytest.raises(KeyError):
            Driver.from_dict(data, mock_transport)
