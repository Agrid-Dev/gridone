from datetime import UTC, datetime

import pytest

from devices_manager.dto.driver_dto import DriverSpec
from devices_manager.dto.driver_dto.driver_dto import core_to_dto, dto_to_core


@pytest.fixture
def yaml_payload():
    return """
id: thermocktat_modbus
transport: modbus-tcp

device_config:
- name: device_id

attributes:
  - name: temperature
    data_type: float
    read: IR0
    scale: 0.01

  - name: temperature_setpoint
    data_type: float
    read_write: HR0
    scale: 0.01

  - name: state
    data_type: bool
    read_write: C0

  - name: temperature_setpoint_min
    data_type: float
    read_write: HR1
    scale: 0.01

  - name: temperature_setpoint_max
    data_type: float
    read_write: HR2
    scale: 0.01

  - name: mode
    data_type: int
    read_write: HR3

  - name: fan_speed
    data_type: int
    read_write: HR3

""".strip()


def test_driver_dto_from_yaml(yaml_payload):
    dto = DriverSpec.from_yaml(yaml_payload)
    assert isinstance(dto, DriverSpec)
    assert dto.id == "thermocktat_modbus"
    assert len(dto.attributes) == 7


def test_dto_to_core_to_dto_preserves_timestamps(driver):
    created = datetime(2020, 1, 1, tzinfo=UTC)
    updated = datetime(2021, 1, 1, tzinfo=UTC)
    dto = core_to_dto(driver).model_copy(
        update={"created_at": created, "updated_at": updated}
    )
    rebuilt_driver = dto_to_core(dto)
    assert rebuilt_driver.metadata.created_at == created
    assert rebuilt_driver.metadata.updated_at == updated

    rebuilt_dto = core_to_dto(rebuilt_driver)
    assert rebuilt_dto.created_at == created
    assert rebuilt_dto.updated_at == updated
