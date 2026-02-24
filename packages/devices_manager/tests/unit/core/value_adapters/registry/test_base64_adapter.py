import base64
import json

import pytest
from devices_manager.core.value_adapters.factory import value_adapter_builders
from devices_manager.core.value_adapters.registry.base64_adapter import base64_adapter


def _encode_json(data: dict) -> str:
    return base64.b64encode(json.dumps(data).encode()).decode()


_PAYLOAD = _encode_json(
    {
        "temperature": 2.26,
        "humidity": 50,
        "co2": 640,
        "motion": 1,
        "light": 500,
        "battery_mv": 3100,
    }
)


def test_decode_temperature() -> None:
    adapter = base64_adapter("/temperature")
    assert adapter.decode(_PAYLOAD) == pytest.approx(2.26)


def test_decode_humidity() -> None:
    adapter = base64_adapter("/humidity")
    assert adapter.decode(_PAYLOAD) == 50


def test_decode_co2() -> None:
    adapter = base64_adapter("/co2")
    assert adapter.decode(_PAYLOAD) == 640


def test_decode_motion() -> None:
    adapter = base64_adapter("/motion")
    assert adapter.decode(_PAYLOAD) == 1


def test_decode_light() -> None:
    adapter = base64_adapter("/light")
    assert adapter.decode(_PAYLOAD) == 500


def test_decode_battery_mv() -> None:
    adapter = base64_adapter("/battery_mv")
    assert adapter.decode(_PAYLOAD) == 3100


def test_decode_negative_temperature() -> None:
    payload = _encode_json({"temperature": -1.96})
    adapter = base64_adapter("/temperature")
    assert adapter.decode(payload) == pytest.approx(-1.96)


def test_decode_missing_field_raises() -> None:
    payload = _encode_json({"temperature": 2.26})
    adapter = base64_adapter("/co2")
    with pytest.raises(KeyError):
        adapter.decode(payload)


def test_encode_flat_pointer() -> None:
    adapter = base64_adapter("/temperature")
    encoded = adapter.encode(22.5)
    decoded = json.loads(base64.b64decode(encoded))
    assert decoded == {"temperature": 22.5}


def test_encode_nested_pointer() -> None:
    adapter = base64_adapter("/sensors/temperature")
    encoded = adapter.encode(22.5)
    decoded = json.loads(base64.b64decode(encoded))
    assert decoded == {"sensors": {"temperature": 22.5}}


def test_encode_decode_roundtrip() -> None:
    adapter = base64_adapter("/temperature")
    assert adapter.decode(adapter.encode(22.5)) == pytest.approx(22.5)


def test_factory_key_exists() -> None:
    assert "base64" in value_adapter_builders


def test_factory_builds_adapter() -> None:
    assert value_adapter_builders["base64"] is base64_adapter
    adapter = base64_adapter("/temperature")
    assert adapter.decode(_encode_json({"temperature": 2.26})) == pytest.approx(2.26)
