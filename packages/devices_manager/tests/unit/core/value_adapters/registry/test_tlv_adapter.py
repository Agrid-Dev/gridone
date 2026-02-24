import base64

import pytest
from devices_manager.core.value_adapters.factory import value_adapter_builders
from devices_manager.core.value_adapters.fn_adapter import FnAdapter
from devices_manager.core.value_adapters.registry.tlv_adapter import tlv_adapter

_TLV_TYPES = [
    {"byte": 0x01, "field": "temperature", "length": 2, "scale": 0.01, "signed": True},
    {"byte": 0x02, "field": "humidity", "length": 1},
    {"byte": 0x04, "field": "co2", "length": 2},
    {"byte": 0x05, "field": "motion", "length": 1},
    {"byte": 0x06, "field": "light", "length": 2},
    {"byte": 0x07, "field": "battery_mv", "length": 2},
]

# Payload captured from the real device
_REAL_PAYLOAD = "AQDUAjQEAGwFIwYDeQcOVg=="

# Hand-crafted multi-field payload
_MULTI_PAYLOAD = base64.b64encode(
    bytes([0x01, 0x00, 0xE2, 0x02, 0x32, 0x04, 0x02, 0x80])
).decode()


def _adapter(field: str) -> FnAdapter:
    return tlv_adapter({"pointer": f"/{field}", "types": _TLV_TYPES})


def test_decode_temperature() -> None:
    assert _adapter("temperature").decode(_MULTI_PAYLOAD) == pytest.approx(2.26)


def test_decode_humidity() -> None:
    assert _adapter("humidity").decode(_MULTI_PAYLOAD) == 50


def test_decode_co2() -> None:
    assert _adapter("co2").decode(_MULTI_PAYLOAD) == 640


def test_decode_negative_temperature() -> None:
    payload = base64.b64encode(bytes([0x01, 0xFF, 0x3C])).decode()
    assert _adapter("temperature").decode(payload) == pytest.approx(-1.96)


def test_decode_missing_field_raises() -> None:
    payload = base64.b64encode(bytes([0x01, 0x00, 0xE2])).decode()
    with pytest.raises(KeyError):
        _adapter("co2").decode(payload)


def test_real_device_payload() -> None:
    assert _adapter("temperature").decode(_REAL_PAYLOAD) == pytest.approx(2.12)
    assert _adapter("humidity").decode(_REAL_PAYLOAD) == 52
    assert _adapter("co2").decode(_REAL_PAYLOAD) == 108
    assert _adapter("light").decode(_REAL_PAYLOAD) == 889
    assert _adapter("battery_mv").decode(_REAL_PAYLOAD) == 3670


def test_factory_key_exists() -> None:
    assert "tlv" in value_adapter_builders


def test_factory_builds_adapter() -> None:
    assert value_adapter_builders["tlv"] is tlv_adapter
