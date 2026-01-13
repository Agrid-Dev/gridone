import asyncio

import pytest
from core.driver import Driver


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

        task = asyncio.create_task(
            driver_w_push_transport.discover(mock_push_transport_client, on_discover)
        )
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

        task = asyncio.create_task(
            driver_w_push_transport.discover(mock_push_transport_client, on_discover)
        )
        await asyncio.sleep(0.05)  # wait for listener to be registered
        for _ in range(3):
            await mock_push_transport_client.simulate_event("/xx", transport_payload)
        task.cancel()
        assert len(discovered) == 1


class TestDriverFromDict:
    def test_from_dict_success(self):
        data = {
            "id": "test_driver",
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

        driver = Driver.from_dict(data)

        assert driver.metadata.id == "test_driver"
        assert len(driver.attributes) == 1

    def test_from_dict_with_env(self):
        data = {
            "id": "test_driver",
            "transport": "http",
            "env": {"key": "value"},
            "device_config": [],
            "attributes": [],
        }

        driver = Driver.from_dict(data)

        assert driver.env == {"key": "value"}

    def test_from_dict_empty_env(self):
        data = {
            "id": "test_driver",
            "transport": "http",
            "env": None,
            "device_config": [],
            "attributes": [],
        }

        driver = Driver.from_dict(data)

        assert driver.env == {}

    def test_from_dict_missing_name(self):
        data = {
            "transport": "http",
            "device_config": [],
            "attributes": [],
        }

        # DriverSchema.from_dict requires "name" field, so this should fail
        with pytest.raises(KeyError):
            Driver.from_dict(data)
