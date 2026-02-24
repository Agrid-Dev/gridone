import base64
import json

import pytest
from devices_manager.core.value_adapters.factory import value_adapter_builders
from devices_manager.core.value_adapters.registry.base64_adapter import base64_adapter
from devices_manager.core.value_adapters.registry.json_pointer_adapter import (
    json_pointer_adapter,
)


def _enc(s: str) -> str:
    return base64.b64encode(s.encode()).decode()


_JSON_PAYLOAD = _enc(json.dumps({"temperature": 2.26, "humidity": 50}))


def test_decode_returns_string() -> None:
    assert isinstance(base64_adapter("").decode(_JSON_PAYLOAD), str)


def test_decode_json_payload() -> None:
    result = base64_adapter("").decode(_JSON_PAYLOAD)
    assert json.loads(result) == {"temperature": 2.26, "humidity": 50}


def test_decode_plain_string() -> None:
    payload = _enc("hello")
    assert base64_adapter("").decode(payload) == "hello"


def test_encode_roundtrip() -> None:
    adapter = base64_adapter("")
    assert adapter.decode(adapter.encode("hello world")) == "hello world"


def test_encode_produces_valid_base64() -> None:
    encoded = base64_adapter("").encode("hello")
    assert base64.b64decode(encoded) == b"hello"


def test_chained_with_json_pointer() -> None:
    """base64 → json_pointer is the intended pattern for JSON payloads."""
    pipeline = base64_adapter("") + json_pointer_adapter("/temperature")  # type: ignore[operator]
    assert pipeline.decode(_JSON_PAYLOAD) == pytest.approx(2.26)


def test_factory_key_exists() -> None:
    assert "base64" in value_adapter_builders


def test_factory_builds_adapter() -> None:
    assert value_adapter_builders["base64"] is base64_adapter
