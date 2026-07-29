from dataclasses import dataclass

import pytest

from devices_manager.core.standard_schemas import validate_standard_schema
from devices_manager.core.standard_schemas.registry.pms_monitor import (
    PMS_MONITOR_KEY,
    pms_monitor_schema,
)
from devices_manager.core.standard_schemas.validate import ValidatedField
from devices_manager.dto.driver_dto import DriverSpec, dto_to_core
from devices_manager.types import DataType
from models.errors import InvalidError


@dataclass
class FakeField:
    name: str
    data_type: DataType


ALL_FIELDS: list[ValidatedField] = [
    FakeField("occupied", DataType.BOOL),
    FakeField("reservation_status", DataType.STRING),
    FakeField("guest_count", DataType.INT),
    FakeField("next_arrival_at", DataType.STRING),
]


def test_schema_is_registered():
    validate_standard_schema(PMS_MONITOR_KEY, ALL_FIELDS)


def test_schema_key():
    assert pms_monitor_schema.key == "pms_monitor"


def test_schema_has_four_required_fields():
    assert len(pms_monitor_schema.fields) == 4
    assert all(f.required for f in pms_monitor_schema.fields)


@pytest.mark.parametrize(
    "missing_field",
    ["occupied", "reservation_status", "guest_count", "next_arrival_at"],
)
def test_missing_required_field_raises(missing_field):
    fields = [f for f in ALL_FIELDS if f.name != missing_field]
    with pytest.raises(InvalidError):
        validate_standard_schema(PMS_MONITOR_KEY, fields)


@pytest.mark.parametrize(
    ("field_name", "wrong_type"),
    [
        ("occupied", DataType.STRING),
        ("reservation_status", DataType.INT),
        ("guest_count", DataType.FLOAT),
        ("next_arrival_at", DataType.INT),
    ],
)
def test_wrong_data_type_raises(field_name, wrong_type):
    fields: list[ValidatedField] = [
        FakeField(
            f.name,
            wrong_type if f.name == field_name else f.data_type,
        )
        for f in ALL_FIELDS
    ]
    with pytest.raises(InvalidError):
        validate_standard_schema(PMS_MONITOR_KEY, fields)


PMS_MONITOR_DRIVER_YAML = """
id: pms_room_monitor
transport: webhook
type: pms_monitor

device_config:
  - name: room_id

attributes:
  - name: occupied
    data_type: bool
    read:
      topic: ${room_id}/snapshot
    codecs:
      - json_pointer: /occupied

  - name: reservation_status
    data_type: str
    read:
      topic: ${room_id}/snapshot
    codecs:
      - json_pointer: /reservation_status

  - name: guest_count
    data_type: int
    read:
      topic: ${room_id}/snapshot
    codecs:
      - json_pointer: /guest_count

  - name: next_arrival_at
    data_type: str
    read:
      topic: ${room_id}/snapshot
    codecs:
      - json_pointer: /next_arrival_at
""".strip()


def test_driver_of_type_pms_monitor_validates():
    driver = dto_to_core(DriverSpec.from_yaml(PMS_MONITOR_DRIVER_YAML))
    assert driver.type == PMS_MONITOR_KEY
