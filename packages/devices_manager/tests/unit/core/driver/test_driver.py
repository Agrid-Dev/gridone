import logging
from unittest.mock import patch

import pytest

from devices_manager.core.driver import Driver, HealthCheck
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
                    "codecs": [],
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

    def test_from_dict_with_healthcheck(self):
        data = {
            "id": "test_driver",
            "transport": "http",
            "device_config": [],
            "healthcheck": {"expected_push_interval": 30},
            "attributes": [],
        }

        driver = Driver.from_dict(data)

        assert driver.healthcheck.expected_push_interval == 30

    def test_from_dict_missing_healthcheck_defaults_to_none(self):
        data = {
            "id": "test_driver",
            "transport": "http",
            "device_config": [],
            "attributes": [],
        }

        driver = Driver.from_dict(data)

        assert driver.healthcheck.expected_push_interval is None

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
        codecs=[],
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


class TestDriverPollingGroupValidation:
    def test_undeclared_polling_group_raises(self):
        attrs = {
            "temp": AttributeDriver(
                name="temp",
                data_type=DataType.FLOAT,
                read="GET /test",
                codecs=[],
                polling_group="core",
            ),
        }
        with pytest.raises(InvalidError, match="undeclared polling_group 'core'"):
            Driver(
                metadata=DriverMetadata(id="test"),
                transport=TransportProtocols.HTTP,
                env={},
                device_config_required=[],
                update_strategy=UpdateStrategy(),
                attributes=attrs,
            )

    def test_declared_polling_group_is_accepted(self):
        attrs = {
            "temp": AttributeDriver(
                name="temp",
                data_type=DataType.FLOAT,
                read="GET /test",
                codecs=[],
                polling_group="core",
            ),
        }
        driver = Driver(
            metadata=DriverMetadata(id="test"),
            transport=TransportProtocols.HTTP,
            env={},
            device_config_required=[],
            update_strategy=UpdateStrategy(polling_groups={"core": 5}),
            attributes=attrs,
        )
        assert driver.attributes["temp"].polling_group == "core"

    def test_no_polling_group_is_accepted_regardless_of_declared_groups(self):
        attrs = {"temp": _make_attribute("temp")}
        driver = Driver(
            metadata=DriverMetadata(id="test"),
            transport=TransportProtocols.HTTP,
            env={},
            device_config_required=[],
            update_strategy=UpdateStrategy(polling_groups={"core": 5}),
            attributes=attrs,
        )
        assert driver.attributes["temp"].polling_group is None


class TestDriverEffectiveExpectedPushInterval:
    def test_healthcheck_only(self):
        driver = Driver(
            metadata=DriverMetadata(id="test"),
            transport=TransportProtocols.HTTP,
            env={},
            device_config_required=[],
            update_strategy=UpdateStrategy(),
            healthcheck=HealthCheck(expected_push_interval=30),
            attributes={},
        )
        assert driver.effective_expected_push_interval == 30

    def test_legacy_update_strategy_only(self):
        driver = Driver(
            metadata=DriverMetadata(id="test"),
            transport=TransportProtocols.HTTP,
            env={},
            device_config_required=[],
            update_strategy=UpdateStrategy(expected_push_interval=30),
            attributes={},
        )
        assert driver.effective_expected_push_interval == 30

    def test_healthcheck_takes_precedence_over_legacy(self):
        driver = Driver(
            metadata=DriverMetadata(id="test"),
            transport=TransportProtocols.HTTP,
            env={},
            device_config_required=[],
            update_strategy=UpdateStrategy(expected_push_interval=300),
            healthcheck=HealthCheck(expected_push_interval=30),
            attributes={},
        )
        assert driver.effective_expected_push_interval == 30

    def test_neither_set_returns_none(self):
        driver = Driver(
            metadata=DriverMetadata(id="test"),
            transport=TransportProtocols.HTTP,
            env={},
            device_config_required=[],
            update_strategy=UpdateStrategy(),
            attributes={},
        )
        assert driver.effective_expected_push_interval is None

    def test_legacy_only_warns_once_at_construction(
        self, caplog: pytest.LogCaptureFixture
    ) -> None:
        with caplog.at_level(logging.WARNING):
            Driver(
                metadata=DriverMetadata(id="legacy_driver"),
                transport=TransportProtocols.HTTP,
                env={},
                device_config_required=[],
                update_strategy=UpdateStrategy(expected_push_interval=30),
                attributes={},
            )
        assert "deprecated" in caplog.text
        assert "legacy_driver" in caplog.text

    def test_healthcheck_set_does_not_warn(
        self, caplog: pytest.LogCaptureFixture
    ) -> None:
        with caplog.at_level(logging.WARNING):
            Driver(
                metadata=DriverMetadata(id="test"),
                transport=TransportProtocols.HTTP,
                env={},
                device_config_required=[],
                update_strategy=UpdateStrategy(expected_push_interval=300),
                healthcheck=HealthCheck(expected_push_interval=30),
                attributes={},
            )
        assert "deprecated" not in caplog.text
