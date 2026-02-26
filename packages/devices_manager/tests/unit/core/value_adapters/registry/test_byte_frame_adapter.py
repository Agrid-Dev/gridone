import base64

import pytest
from devices_manager.core.value_adapters.factory import value_adapter_builders
from devices_manager.core.value_adapters.registry.base64_adapter import base64_adapter
from devices_manager.core.value_adapters.registry.byte_frame_adapter import (
    byte_frame_adapter,
)
from models.errors import InvalidError

_PREFIX = "11 05 00 13 00 55 20"
_PREFIX_BYTES = bytes([0x11, 0x05, 0x00, 0x13, 0x00, 0x55, 0x20])
_FRAME = _PREFIX_BYTES + bytes([0x03])  # state=3 (Stop)


def test_decode_extracts_byte_at_index() -> None:
    adapter = byte_frame_adapter(f"7|{_PREFIX}")
    payload = bytes(7) + bytes([0x02])  # state=2 at index 7
    assert adapter.decode(payload) == 2


def test_encode_prepends_prefix() -> None:
    adapter = byte_frame_adapter(f"7|{_PREFIX}")
    assert adapter.encode(3) == _FRAME


def test_invalid_argument_raises() -> None:
    with pytest.raises(InvalidError, match="Invalid byte_frame argument"):
        byte_frame_adapter("invalid")


def test_factory_key_exists() -> None:
    assert "byte_frame" in value_adapter_builders


def test_factory_builds_adapter() -> None:
    assert value_adapter_builders["byte_frame"] is byte_frame_adapter


def test_chain_with_base64() -> None:
    pipeline = base64_adapter("") + byte_frame_adapter(f"7|{_PREFIX}")
    b64_payload = base64.b64encode(bytes(7) + bytes([0x01])).decode()
    assert pipeline.decode(b64_payload) == 1
    expected = base64.b64encode(_PREFIX_BYTES + bytes([0x01])).decode()
    assert pipeline.encode(1) == expected
