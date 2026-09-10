from unittest.mock import patch

import pytest

from devices_manager.core.driver import (
    AttributeRef,
    Driver,
    WriteConstraints,
    attributes_referencing,
    validate_write_constraints,
)
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


class TestDriverPushOnlyValidation:
    def test_webhook_driver_cannot_enable_polling(self):
        with pytest.raises(InvalidError, match="push-only"):
            Driver(
                metadata=DriverMetadata(id="webhook_driver"),
                env={},
                device_config_required=[],
                transport=TransportProtocols.WEBHOOK,
                update_strategy=UpdateStrategy(polling_enabled=True),
                attributes={},
            )

    def test_webhook_driver_cannot_declare_polling_groups(self):
        with pytest.raises(InvalidError, match="polling groups"):
            Driver(
                metadata=DriverMetadata(id="webhook_driver"),
                env={},
                device_config_required=[],
                transport=TransportProtocols.WEBHOOK,
                update_strategy=UpdateStrategy(
                    polling_enabled=False, polling_groups={"core": 5}
                ),
                attributes={},
            )

    def test_webhook_driver_with_polling_disabled_is_valid(self):
        driver = Driver(
            metadata=DriverMetadata(id="webhook_driver"),
            env={},
            device_config_required=[],
            transport=TransportProtocols.WEBHOOK,
            update_strategy=UpdateStrategy(polling_enabled=False),
            attributes={},
        )
        assert driver.transport == TransportProtocols.WEBHOOK


def _constrained(
    name: str,
    data_type: DataType,
    *,
    minimum: float | str | None = None,
    maximum: float | str | None = None,
    step: float | AttributeRef | None = None,
) -> AttributeDriver:
    """An attribute whose bounds are constants (numbers) or references (names)."""

    def bound(value: float | str | None) -> float | AttributeRef | None:
        return AttributeRef(attribute=value) if isinstance(value, str) else value

    return AttributeDriver(
        name=name,
        data_type=data_type,
        read=f"GET /{name}",
        write=f"POST /{name}",
        codecs=[],
        write_constraints=WriteConstraints(
            step=step, minimum=bound(minimum), maximum=bound(maximum)
        ),
    )


class TestDriverWriteConstraintsValidation:
    def test_references_to_numeric_siblings_are_accepted(self):
        attrs = {
            "setpoint": _constrained(
                "setpoint", DataType.FLOAT, minimum="floor", maximum="ceiling", step=0.5
            ),
            "floor": _make_attribute("floor", DataType.INT),
            "ceiling": _make_attribute("ceiling", DataType.FLOAT),
        }
        driver = _make_driver(attributes=attrs)
        assert driver.attributes["setpoint"].write_constraints is not None

    def test_constant_bounds_need_no_sibling(self):
        driver = _make_driver(
            attributes={"fan": _constrained("fan", DataType.INT, minimum=0, maximum=3)}
        )
        assert driver.attributes["fan"].write_constraints == WriteConstraints(
            minimum=0, maximum=3
        )

    @pytest.mark.parametrize("data_type", [DataType.STRING, DataType.BOOL])
    def test_constraints_on_non_numeric_attribute_are_rejected(self, data_type):
        attrs = {"mode": _constrained("mode", data_type, minimum=0)}
        with pytest.raises(
            InvalidError,
            match=f"Attribute 'mode' declares write_constraints but its data_type "
            f"'{data_type.value}' is not numeric",
        ):
            _make_driver(attributes=attrs)

    def test_reference_to_missing_attribute_is_rejected(self):
        attrs = {
            "setpoint": _constrained("setpoint", DataType.FLOAT, maximum="ceiling")
        }
        with pytest.raises(
            InvalidError,
            match=r"Attribute 'setpoint' write_constraints\.maximum references unknown "
            r"attribute 'ceiling'",
        ):
            _make_driver(attributes=attrs)

    @pytest.mark.parametrize("data_type", [DataType.STRING, DataType.BOOL])
    def test_reference_to_non_numeric_attribute_is_rejected(self, data_type):
        attrs = {
            "setpoint": _constrained("setpoint", DataType.FLOAT, minimum="floor"),
            "floor": _make_attribute("floor", data_type),
        }
        with pytest.raises(
            InvalidError,
            match="Attribute 'setpoint' write_constraints.minimum references attribute "
            f"'floor' whose data_type '{data_type.value}' is not numeric",
        ):
            _make_driver(attributes=attrs)

    def test_self_reference_is_rejected(self):
        attrs = {
            "setpoint": _constrained("setpoint", DataType.FLOAT, minimum="setpoint")
        }
        with pytest.raises(
            InvalidError,
            match=r"Attribute 'setpoint' write_constraints\.minimum must not reference "
            r"the attribute itself",
        ):
            _make_driver(attributes=attrs)

    def test_step_reference_to_numeric_sibling_is_accepted(self):
        attrs = {
            "setpoint": _constrained(
                "setpoint", DataType.FLOAT, step=AttributeRef(attribute="precision")
            ),
            "precision": _make_attribute("precision", DataType.FLOAT),
        }
        driver = _make_driver(attributes=attrs)
        assert driver.attributes["setpoint"].write_constraints == WriteConstraints(
            step=AttributeRef(attribute="precision")
        )

    def test_step_reference_to_non_numeric_attribute_is_rejected(self):
        attrs = {
            "setpoint": _constrained(
                "setpoint", DataType.FLOAT, step=AttributeRef(attribute="precision")
            ),
            "precision": _make_attribute("precision", DataType.STRING),
        }
        with pytest.raises(
            InvalidError,
            match=r"Attribute 'setpoint' write_constraints\.step references attribute "
            r"'precision' whose data_type 'str' is not numeric",
        ):
            _make_driver(attributes=attrs)

    def test_validate_write_constraints_is_a_plain_function(self):
        """Usable on a candidate attribute list, outside any Driver."""
        with pytest.raises(InvalidError, match="unknown attribute 'nope'"):
            validate_write_constraints(
                [_constrained("setpoint", DataType.FLOAT, minimum="nope")]
            )

    def test_attributes_referencing_lists_the_dependants(self):
        setpoint = _constrained("setpoint", DataType.FLOAT, minimum="floor")
        fan = _constrained("fan", DataType.INT, minimum=0)
        floor = _make_attribute("floor", DataType.FLOAT)
        assert attributes_referencing([setpoint, fan, floor], "floor") == [setpoint]
        assert attributes_referencing([setpoint, fan, floor], "setpoint") == []
