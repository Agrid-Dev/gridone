import base64

import pytest
from devices_manager.core.value_adapters.factory import supported_value_adapters
from devices_manager.core.value_adapters.registry.tlv_adapter import build_tlv_adapter

_TLV_TYPES = {
    0x01: ("temperature", 2, 0.01, True),
    0x02: ("humidity", 1, 1.0, False),
    0x04: ("co2", 2, 1.0, False),
    0x05: ("motion", 1, 1.0, False),
    0x06: ("light", 2, 1.0, False),
    0x07: ("battery_mv", 2, 1.0, False),
}

_tlv_adapter = build_tlv_adapter(_TLV_TYPES)

# Payload from the real device
_REAL_PAYLOAD = "AQDUAjQEAGwFIwYDeQcOVg=="

# Hand-crafted multi-field payload used in unit tests
_MULTI_PAYLOAD = base64.b64encode(
    bytes([0x01, 0x00, 0xE2, 0x02, 0x32, 0x04, 0x02, 0x80])
).decode()


def test_decode_temperature() -> None:
    assert _tlv_adapter("/temperature").decode(_MULTI_PAYLOAD) == pytest.approx(2.26)


def test_decode_humidity() -> None:
    assert _tlv_adapter("/humidity").decode(_MULTI_PAYLOAD) == 50


def test_decode_co2() -> None:
    assert _tlv_adapter("/co2").decode(_MULTI_PAYLOAD) == 640


def test_decode_negative_temperature() -> None:
    payload = base64.b64encode(bytes([0x01, 0xFF, 0x3C])).decode()
    assert _tlv_adapter("/temperature").decode(payload) == pytest.approx(-1.96)


def test_decode_missing_field_raises() -> None:
    payload = base64.b64encode(bytes([0x01, 0x00, 0xE2])).decode()
    with pytest.raises(KeyError):
        _tlv_adapter("/co2").decode(payload)


def test_real_device_payload() -> None:
    assert _tlv_adapter("/temperature").decode(_REAL_PAYLOAD) == pytest.approx(2.12)
    assert _tlv_adapter("/humidity").decode(_REAL_PAYLOAD) == 52
    assert _tlv_adapter("/co2").decode(_REAL_PAYLOAD) == 108
    assert _tlv_adapter("/light").decode(_REAL_PAYLOAD) == 889
    assert _tlv_adapter("/battery_mv").decode(_REAL_PAYLOAD) == 3670


def test_factory_key_exists() -> None:
    assert "tlv" in supported_value_adapters
