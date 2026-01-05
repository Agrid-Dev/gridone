import asyncio
from unittest.mock import AsyncMock

import pytest
from core.driver import Driver
from core.driver.driver_schema import DriverSchema
from core.driver.driver_schema.attribute_schema import AttributeSchema
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
def driver(mock_transport_client, simple_driver_schema):
    return Driver(
        name="test_driver",
        env={"base_url": "http://example.com"},
        transport=mock_transport_client,
        schema=simple_driver_schema,
    )


@pytest.fixture
def push_driver_schema():
    return DriverSchema(
        name="test_push_driver",
        transport=TransportProtocols.MQTT,
        update_strategy=UpdateStrategy(),
        device_config_fields=[],
        attribute_schemas=[
            AttributeSchema(
                name="temperature",
                data_type=DataType.FLOAT,
                read={"topic": "/xx/temperature"},
                write=None,
                value_adapter=[
                    ValueAdapterSpec(
                        adapter="json_pointer", argument="/payload/temperature"
                    )
                ],
            ),
        ],
        discovery={
            "topic": "/xx",
            "field_getters": [
                {"name": "vendor_id", "adapters": [{"json_pointer": "/id"}]},
                {"name": "gateway_id", "adapters": [{"json_pointer": "/gateway_id"}]},
            ],
        },
    )


@pytest.fixture
def driver_w_push_transport(mock_push_transport_client, push_driver_schema):
    return Driver(
        name="test_driver",
        env={"base_url": "http://example.com"},
        transport=mock_push_transport_client,
        schema=push_driver_schema,
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

        await driver_w_push_transport.attach_update_listener(
            "temperature", device_config, callback
        )
        # Simulate transport reading a value
        await mock_push_transport_client.simulate_event(
            "/xx/temperature", {"payload": {"temperature": 25}}
        )
        assert callback_called
        assert callback_value == 25

    @pytest.mark.asyncio
    async def test_attach_updater_invalid_attribute(self, driver_w_push_transport):
        device_config = {"device_id": "device1"}

        def callback(value) -> None:
            pass

        with pytest.raises(ValueError, match="Attribute invalid_attr is not supported"):
            await driver_w_push_transport.attach_update_listener(
                "invalid_attr", device_config, callback
            )


class TestDriverDiscover:
    @pytest.mark.asyncio
    async def test_discover_new_device(
        self, driver_w_push_transport, mock_push_transport_client, transport_payload
    ):
        discovered = []

        def on_discover(device_config, attributes) -> None:
            nonlocal discovered
            print("Discovered!", device_config, attributes)
            discovered.append((device_config, attributes))

        task = asyncio.create_task(driver_w_push_transport.discover(on_discover))
        await asyncio.sleep(0.05)  # wait for listener to be registered
        await mock_push_transport_client.simulate_event("/xx", transport_payload)
        task.cancel()
        assert len(discovered) == 1
        device_config, attributes = discovered[0]
        assert device_config["vendor_id"] == "30523-042:47"
        assert (
            device_config["gateway_id"]
            == "b831c424a37e41fba308bf7119f95e47907214eeeae4bedfa08df6c2a28f448"
        )
        assert attributes["temperature"] == 21.5

    @pytest.mark.asyncio
    async def test_discover_new_device_no_duplicates(
        self, driver_w_push_transport, mock_push_transport_client, transport_payload
    ):
        discovered = []

        def on_discover(device_config, attributes) -> None:
            nonlocal discovered
            print("Discovered!", device_config, attributes)
            discovered.append((device_config, attributes))

        task = asyncio.create_task(driver_w_push_transport.discover(on_discover))
        await asyncio.sleep(0.05)  # wait for listener to be registered
        for _ in range(3):
            await mock_push_transport_client.simulate_event("/xx", transport_payload)
        task.cancel()
        assert len(discovered) == 1


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
