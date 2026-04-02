from unittest.mock import patch

import pytest

from devices_manager.core.driver import Driver
from devices_manager.core.driver.attribute_driver import AttributeDriver
from devices_manager.core.driver.driver_metadata import DriverMetadata
from devices_manager.core.driver.update_strategy import UpdateStrategy
from devices_manager.types import DataType, TransportProtocols
from models.errors import InvalidError


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


def _make_attribute(name: str, data_type: DataType = DataType.FLOAT) -> AttributeDriver:
    return AttributeDriver(
        name=name,
        data_type=data_type,
        read="GET /test",
        write=None,
        value_adapter_specs=[],
    )


def _make_driver(
    attributes: dict[str, AttributeDriver] | None = None,
    driver_type: str | None = None,
) -> Driver:
    return Driver(
        metadata=DriverMetadata(id="test"),
        transport=TransportProtocols.HTTP,
        env={},
        device_config_required=[],
        update_strategy=UpdateStrategy(),
        attributes=attributes or {},
        type=driver_type,
    )


class TestDriverStandardSchemaValidation:
    def test_no_type_skips_validation(self):
        with patch(
            "devices_manager.core.driver.driver.validate_standard_schema"
        ) as mock_validate:
            _make_driver(driver_type=None)
            mock_validate.assert_not_called()

    def test_type_set_calls_validation_with_attributes(self):
        attrs = {
            "temp": _make_attribute("temp"),
            "mode": _make_attribute("mode", DataType.STRING),
        }
        with patch(
            "devices_manager.core.driver.driver.validate_standard_schema"
        ) as mock_validate:
            _make_driver(attributes=attrs, driver_type="my_type")
            mock_validate.assert_called_once_with("my_type", list(attrs.values()))

    def test_type_set_with_invalid_attributes_raises(self):
        with (
            patch(
                "devices_manager.core.driver.driver.validate_standard_schema",
                side_effect=InvalidError("Field temp is required"),
            ),
            pytest.raises(InvalidError),
        ):
            _make_driver(driver_type="my_type")
