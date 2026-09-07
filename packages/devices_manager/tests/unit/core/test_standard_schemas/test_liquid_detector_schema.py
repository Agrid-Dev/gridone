from dataclasses import dataclass

import pytest

from devices_manager.core.driver.attribute_driver import FaultAttributeDriver
from devices_manager.core.standard_schemas import validate_standard_schema
from devices_manager.core.standard_schemas.registry.liquid_detector import (
    LIQUID_DETECTOR_KEY,
    liquid_detector_schema,
)
from devices_manager.core.standard_schemas.validate import ValidatedField
from devices_manager.dto.driver_dto import DriverSpec, dto_to_core
from devices_manager.types import DataType
from models.errors import InvalidError


@dataclass
class FakeField:
    name: str
    data_type: DataType


ALL_FIELDS: list[ValidatedField] = [FakeField("liquid_detected", DataType.BOOL)]


def test_schema_is_registered():
    validate_standard_schema(LIQUID_DETECTOR_KEY, ALL_FIELDS)


def test_schema_key():
    assert liquid_detector_schema.key == "liquid_detector"


def test_schema_fields():
    assert [
        (f.name, f.required, f.data_type) for f in liquid_detector_schema.fields
    ] == [("liquid_detected", True, DataType.BOOL)]


def test_missing_required_field_raises():
    with pytest.raises(InvalidError):
        validate_standard_schema(LIQUID_DETECTOR_KEY, [])


@pytest.mark.parametrize("wrong_type", [DataType.INT, DataType.FLOAT, DataType.STRING])
def test_wrong_data_type_raises(wrong_type):
    fields: list[ValidatedField] = [FakeField("liquid_detected", wrong_type)]
    with pytest.raises(InvalidError):
        validate_standard_schema(LIQUID_DETECTOR_KEY, fields)


def test_extra_attributes_are_allowed():
    """A detector also reporting ambient conditions still validates — the
    schema constrains what must exist, not what may."""
    fields: list[ValidatedField] = [
        *ALL_FIELDS,
        FakeField("temperature", DataType.FLOAT),
        FakeField("humidity", DataType.FLOAT),
        FakeField("battery", DataType.INT),
    ]
    validate_standard_schema(LIQUID_DETECTOR_KEY, fields)


LIQUID_DETECTOR_DRIVER_YAML = """
id: liquid_detector_probe
transport: mqtt
type: liquid_detector

device_config:
  - name: dev_eui

attributes:
  - name: liquid_detected
    kind: fault
    severity: alert
    data_type: bool
    read:
      topic: ${dev_eui}/uplink
    codecs:
      - json_pointer: /object/leakage_status
""".strip()


def test_driver_declaring_the_reading_as_a_fault_validates():
    """The recommended shape: `liquid_detected` is the standard reading *and*
    an alert-severity fault, so the platform's fault machinery owns the alarm
    (badge, severity tint, active-fault row, notifications) while the standard
    control just renders the reading. Fault attributes go through the same
    schema validation as standard ones, and `healthy_values` defaults to
    ``[False]`` for a bool — a detector is healthy while dry."""
    driver = dto_to_core(DriverSpec.from_yaml(LIQUID_DETECTOR_DRIVER_YAML))

    assert driver.type == LIQUID_DETECTOR_KEY
    attribute = driver.attributes["liquid_detected"]
    assert isinstance(attribute, FaultAttributeDriver)
    assert attribute.severity == "alert"
    assert attribute.healthy_values == [False]
