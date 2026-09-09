from dataclasses import dataclass

import pytest

from devices_manager.core.driver.attribute_driver import FaultAttributeDriver
from devices_manager.core.standard_schemas import validate_standard_schema
from devices_manager.core.standard_schemas.registry.pump import PUMP_KEY, pump_schema
from devices_manager.core.standard_schemas.validate import ValidatedField
from devices_manager.dto.driver_dto import DriverSpec, dto_to_core
from devices_manager.types import DataType
from models.errors import InvalidError


@dataclass
class FakeField:
    name: str
    data_type: DataType


REQUIRED: list[ValidatedField] = [FakeField("onoff_state", DataType.BOOL)]

OPTIONAL: list[ValidatedField] = [
    FakeField("head", DataType.FLOAT),
    FakeField("volume_flow", DataType.FLOAT),
    FakeField("speed", DataType.FLOAT),
    FakeField("operating_hours", DataType.FLOAT),
    FakeField("control_mode", DataType.STRING),
    FakeField("setpoint", DataType.FLOAT),
    FakeField("actual_setpoint", DataType.FLOAT),
    FakeField("power", DataType.FLOAT),
    FakeField("energy", DataType.FLOAT),
    FakeField("motor_current", DataType.FLOAT),
    FakeField("liquid_temperature", DataType.FLOAT),
    FakeField("starts", DataType.FLOAT),
    FakeField("motor_voltage", DataType.FLOAT),
]

ALL_FIELDS: list[ValidatedField] = [*REQUIRED, *OPTIONAL]


def test_schema_is_registered():
    validate_standard_schema(PUMP_KEY, ALL_FIELDS)


def test_schema_key():
    assert pump_schema.key == "pump"


def test_only_run_state_is_required():
    """The whole design decision. head/volume_flow/speed also score 100% across
    the surveyed sources, but every source is a smart variable-speed pump —
    requiring them would make a dry-contact circulation pump untypable. Even
    faults are absent entirely: alarms are orthogonal infrastructure that
    works on any attribute through `kind: fault`, so the type contract does
    not name them."""
    assert [f.name for f in pump_schema.fields if f.required] == ["onoff_state"]


def test_schema_covers_the_surveyed_contract():
    assert {f.name for f in pump_schema.fields} == {f.name for f in ALL_FIELDS}


def test_missing_run_state_raises():
    fields = [f for f in ALL_FIELDS if f.name != "onoff_state"]
    with pytest.raises(InvalidError):
        validate_standard_schema(PUMP_KEY, fields)


def test_dry_contact_pump_validates_on_two_points():
    """A booster or circulation pump wired to two dry contacts exposes run
    state and a fault contact, nothing else."""
    validate_standard_schema(PUMP_KEY, [*REQUIRED, FakeField("fault", DataType.BOOL)])


def test_run_feedback_alone_validates():
    """The floor of the contract: one contact saying whether it turns."""
    validate_standard_schema(PUMP_KEY, REQUIRED)


@pytest.mark.parametrize(
    ("field_name", "wrong_type"),
    [
        ("onoff_state", DataType.FLOAT),
        ("head", DataType.STRING),
        ("control_mode", DataType.FLOAT),
        ("starts", DataType.STRING),
    ],
)
def test_wrong_data_type_raises(field_name, wrong_type):
    fields: list[ValidatedField] = [
        FakeField(f.name, wrong_type if f.name == field_name else f.data_type)
        for f in ALL_FIELDS
    ]
    with pytest.raises(InvalidError):
        validate_standard_schema(PUMP_KEY, fields)


def test_extra_attributes_are_allowed():
    """A smart pump exposing 41 points carries the rest as non-standard
    attributes — the schema constrains what must exist, not what may."""
    fields: list[ValidatedField] = [
        *ALL_FIELDS,
        FakeField("fault", DataType.BOOL),
        FakeField("thermal_energy", DataType.FLOAT),
        FakeField("firmware_version", DataType.STRING),
    ]
    validate_standard_schema(PUMP_KEY, fields)


DRY_CONTACT_PUMP_YAML = """
id: dry_contact_pump
transport: modbus-tcp
type: pump

device_config:
  - name: device_id

attributes:
  - name: onoff_state
    data_type: bool
    read: C0

  - name: fault
    kind: fault
    severity: alert
    data_type: bool
    read: C1
""".strip()


def test_two_point_driver_carries_its_fault_outside_the_schema():
    """A dry-contact pump satisfies the schema on `onoff_state` alone; its
    fault contact rides along as a fault attribute the schema never names,
    and the platform's generic machinery owns the alarm from there."""
    driver = dto_to_core(DriverSpec.from_yaml(DRY_CONTACT_PUMP_YAML))

    assert driver.type == PUMP_KEY
    assert "fault" not in {f.name for f in pump_schema.fields}
    attribute = driver.attributes["fault"]
    assert isinstance(attribute, FaultAttributeDriver)
    assert attribute.severity == "alert"
    assert attribute.healthy_values == [False]


NORMALLY_CLOSED_PUMP_YAML = """
id: nc_contact_pump
transport: modbus-tcp
type: pump

device_config:
  - name: device_id

attributes:
  - name: onoff_state
    data_type: bool
    read: C0

  - name: fault
    kind: fault
    severity: alert
    data_type: bool
    healthy_value: true
    read: C1
""".strip()


def test_normally_closed_fault_contact_inverts_via_healthy_value():
    """Dry-contact fault wiring is not always normally-open. On NC wiring a
    closed contact (`True`) means healthy, so the driver says so rather than
    inverting with a codec — otherwise the pump ships permanently faulted."""
    driver = dto_to_core(DriverSpec.from_yaml(NORMALLY_CLOSED_PUMP_YAML))

    attribute = driver.attributes["fault"]
    assert isinstance(attribute, FaultAttributeDriver)
    assert attribute.healthy_values == [True]
