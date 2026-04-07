from datetime import UTC, datetime, timedelta

import pytest
from users.auth import TokenPayload


_ADMIN_PAYLOAD = TokenPayload(
    sub="test-user",
    role="admin",
    exp=datetime.now(UTC) + timedelta(hours=1),
)


@pytest.fixture
def admin_token_payload() -> TokenPayload:
    """Admin token payload for use in router and integration tests."""
    return _ADMIN_PAYLOAD


@pytest.fixture
def yaml_driver():
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
