import base64

import pytest
from devices_manager.core.value_adapters.factory import value_adapter_builders
from devices_manager.core.value_adapters.registry.base64_adapter import base64_adapter
from devices_manager.core.value_adapters.registry.json_pointer_adapter import (
    json_pointer_adapter,
)

_JSON_PAYLOAD = base64.b64encode(b'{"temperature": 2.26, "humidity": 50}').decode()


def test_decode_returns_bytes() -> None:
    assert isinstance(base64_adapter("").decode(_JSON_PAYLOAD), bytes)


def test_encode_roundtrip() -> None:
    adapter = base64_adapter("")
    assert adapter.decode(adapter.encode(b"hello world")) == b"hello world"


def test_chained_with_json_pointer() -> None:
    pipeline = base64_adapter("") + json_pointer_adapter("/temperature")  # type: ignore[operator]
    assert pipeline.decode(_JSON_PAYLOAD) == pytest.approx(2.26)


def test_factory_key_exists() -> None:
    assert "base64" in value_adapter_builders


def test_factory_builds_adapter() -> None:
    assert value_adapter_builders["base64"] is base64_adapter
