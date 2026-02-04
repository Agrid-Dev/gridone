import pytest
from core.driver import Driver


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
