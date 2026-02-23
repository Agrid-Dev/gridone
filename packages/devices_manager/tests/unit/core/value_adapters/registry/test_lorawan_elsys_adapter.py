import base64

import pytest

from devices_manager.core.value_adapters.factory import value_adapter_builders
from devices_manager.core.value_adapters.registry.lorawan_elsys_adapter import (
    lorawan_elsys_adapter,
)


def _encode(payload: bytes) -> str:
    return base64.b64encode(payload).decode()


# ---------------------------------------------------------------------------
# Happy path — multi-field payload
# ---------------------------------------------------------------------------

# Build a payload with temperature (0x01), humidity (0x02), co2 (0x04).
#   temperature: 0x01 | 0x00 0xE2  -> 226 * 0.01 = 2.26 °C
#   humidity:    0x02 | 0x32       -> 50 * 1 = 50 %
#   co2:         0x04 | 0x02 0x80  -> 640 ppm
_MULTI_PAYLOAD = _encode(
    bytes([0x01, 0x00, 0xE2, 0x02, 0x32, 0x04, 0x02, 0x80])
)


def test_decode_temperature() -> None:
    adapter = lorawan_elsys_adapter("temperature")
    assert adapter.decode(_MULTI_PAYLOAD) == pytest.approx(2.26)


def test_decode_humidity() -> None:
    adapter = lorawan_elsys_adapter("humidity")
    assert adapter.decode(_MULTI_PAYLOAD) == 50


def test_decode_co2() -> None:
    adapter = lorawan_elsys_adapter("co2")
    assert adapter.decode(_MULTI_PAYLOAD) == 640


# ---------------------------------------------------------------------------
# Signed temperature — negative value
# ---------------------------------------------------------------------------

# temperature: 0x01 | 0xFF 0x3C  -> signed int16 = -196, * 0.01 = -1.96 °C
def test_negative_temperature() -> None:
    payload = _encode(bytes([0x01, 0xFF, 0x3C]))
    adapter = lorawan_elsys_adapter("temperature")
    assert adapter.decode(payload) == pytest.approx(-1.96)


# Exactly -10.0 °C: 0x01 | 0xFC 0x18  -> -1000 * 0.01 = -10.0 °C
def test_negative_ten_celsius() -> None:
    payload = _encode(bytes([0x01, 0xFC, 0x18]))
    adapter = lorawan_elsys_adapter("temperature")
    assert adapter.decode(payload) == pytest.approx(-10.0)


# ---------------------------------------------------------------------------
# Partial payload — missing field raises KeyError
# ---------------------------------------------------------------------------

# Payload only contains temperature + humidity — no co2 field
_PARTIAL_PAYLOAD = _encode(bytes([0x01, 0x00, 0xE2, 0x02, 0x32]))


def test_partial_payload_missing_field_raises() -> None:
    adapter = lorawan_elsys_adapter("co2")
    with pytest.raises(KeyError):
        adapter.decode(_PARTIAL_PAYLOAD)


# ---------------------------------------------------------------------------
# Other supported fields
# ---------------------------------------------------------------------------

# motion: 0x05 | 0x01  -> 1
# light:  0x06 | 0x01 0xF4  -> 500
# battery_mv: 0x07 | 0x0C 0x1C  -> 3100
_ALL_FIELDS_PAYLOAD = _encode(
    bytes([
        0x01, 0x00, 0xE2,        # temperature = 2.26
        0x02, 0x32,              # humidity = 50
        0x04, 0x02, 0x80,        # co2 = 640
        0x05, 0x01,              # motion = 1
        0x06, 0x01, 0xF4,        # light = 500
        0x07, 0x0C, 0x1C,        # battery_mv = 3100
    ])
)


def test_decode_motion() -> None:
    adapter = lorawan_elsys_adapter("motion")
    assert adapter.decode(_ALL_FIELDS_PAYLOAD) == 1


def test_decode_light() -> None:
    adapter = lorawan_elsys_adapter("light")
    assert adapter.decode(_ALL_FIELDS_PAYLOAD) == 500


def test_decode_battery_mv() -> None:
    adapter = lorawan_elsys_adapter("battery_mv")
    assert adapter.decode(_ALL_FIELDS_PAYLOAD) == 3100


# ---------------------------------------------------------------------------
# Factory integration
# ---------------------------------------------------------------------------

def test_factory_key_exists() -> None:
    assert "lorawan_elsys" in value_adapter_builders


def test_factory_builds_adapter() -> None:
    builder = value_adapter_builders["lorawan_elsys"]
    adapter = builder("temperature")
    payload = _encode(bytes([0x01, 0x00, 0xE2]))
    assert adapter.decode(payload) == pytest.approx(2.26)
