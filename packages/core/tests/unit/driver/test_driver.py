from unittest.mock import AsyncMock

import pytest
from core.driver import Driver
from core.driver.driver_schema import DriverSchema
from core.driver.driver_schema.attribute_schema import AttributeSchema
from core.driver.driver_schema.driver_schema import DeviceConfigField
from core.driver.driver_schema.update_strategy import UpdateStrategy
from core.types import DataType, TransportProtocols
from core.value_adapters.factory import ValueAdapterSpec


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
    )


@pytest.fixture
def driver(mock_transport_client, simple_driver_schema):
    return Driver(
        name="test_driver",
        env={"base_url": "http://example.com"},
        transport=mock_transport_client,
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
    async def test_read_value_success(self, driver, mock_transport_client):
        device_config = {"device_id": "device1"}
        mock_transport_client.read = AsyncMock(return_value="23.5")

        value = await driver.read_value("temperature", device_config)

        assert value == "23.5"
        mock_transport_client.read.assert_called_once()

    @pytest.mark.asyncio
    async def test_read_value_with_context(self, driver, mock_transport_client):
        device_config = {"device_id": "device1", "sensor_id": "sensor1"}
        driver.env = {"base_url": "http://api.example.com"}
        mock_transport_client.read = AsyncMock(return_value="20.0")

        value = await driver.read_value("temperature", device_config)

        assert value == "20.0"


class TestDriverWriteValue:
    @pytest.mark.asyncio
    async def test_write_value_success(self, driver, mock_transport_client):
        device_config = {"device_id": "device1"}
        mock_transport_client.write = AsyncMock()

        await driver.write_value("humidity", device_config, 65.0)

        mock_transport_client.write.assert_called_once()

    @pytest.mark.asyncio
    async def test_write_value_not_writable(self, driver):
        device_config = {"device_id": "device1"}

        with pytest.raises(ValueError, match="Attribute 'temperature' is not writable"):
            await driver.write_value("temperature", device_config, 25.0)

    @pytest.mark.asyncio
    async def test_write_value_with_value_in_context(
        self, driver, mock_transport_client
    ):
        device_config = {"device_id": "device1"}
        mock_transport_client.write = AsyncMock()

        await driver.write_value("humidity", device_config, 70.5)

        mock_transport_client.write.assert_called_once()


class TestDriverFromDict:
    def test_from_dict_success(self, mock_transport_client):
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

        driver = Driver.from_dict(data, mock_transport_client)

        assert driver.name == "test_driver"
        assert driver.transport == mock_transport_client
        assert len(driver.schema.attribute_schemas) == 1

    def test_from_dict_wrong_transport(self, mock_transport_client):
        data = {
            "name": "test_driver",
            "transport": "mqtt",
            "device_config": [],
            "attributes": [],
        }

        msg = "Expected a mqtt transport but got http"
        with pytest.raises(ValueError, match=msg):
            Driver.from_dict(data, mock_transport_client)

    def test_from_dict_with_env(self, mock_transport_client):
        data = {
            "name": "test_driver",
            "transport": "http",
            "env": {"key": "value"},
            "device_config": [],
            "attributes": [],
        }

        driver = Driver.from_dict(data, mock_transport_client)

        assert driver.env == {"key": "value"}

    def test_from_dict_empty_env(self, mock_transport_client):
        data = {
            "name": "test_driver",
            "transport": "http",
            "env": None,
            "device_config": [],
            "attributes": [],
        }

        driver = Driver.from_dict(data, mock_transport_client)

        assert driver.env == {}

    def test_from_dict_missing_name(self, mock_transport_client):
        data = {
            "transport": "http",
            "device_config": [],
            "attributes": [],
        }

        # DriverSchema.from_dict requires "name" field, so this should fail
        with pytest.raises(KeyError):
            Driver.from_dict(data, mock_transport_client)
