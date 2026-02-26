import pytest
from devices_manager.core.value_adapters.registry.byte_frame_adapter import (
    byte_frame_adapter,
)
from models.errors import InvalidError

_PREFIX = "11 05 00 13 00 55 20"
_PREFIX_BYTES = bytes([0x11, 0x05, 0x00, 0x13, 0x00, 0x55, 0x20])
_FRAME = _PREFIX_BYTES + bytes([0x03])  # state=3 (Stop)


def test_decode_extracts_byte_after_prefix() -> None:
    adapter = byte_frame_adapter(_PREFIX)
    payload = _PREFIX_BYTES + bytes([0x02])  # state=2 right after prefix
    assert adapter.decode(payload) == 2


def test_encode_prepends_prefix() -> None:
    adapter = byte_frame_adapter(_PREFIX)
    assert adapter.encode(3) == _FRAME


def test_invalid_argument_raises() -> None:
    with pytest.raises(InvalidError, match="Invalid byte_frame argument"):
        byte_frame_adapter("invalid")
