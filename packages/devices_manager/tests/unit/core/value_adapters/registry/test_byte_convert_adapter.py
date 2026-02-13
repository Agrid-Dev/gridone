import pytest
from devices_manager.core.value_adapters.registry.byte_convert_adapter import (
    byte_convert_adapter,
)


@pytest.mark.parametrize(
    ("spec", "raw", "decoded"),
    [
        ("uint16", 123, 123),
        ("int16", 0xFFFF, -1),
        ("bool", 0, False),
        ("bool", 1, True),
        ("uint32", [0x1234, 0x5678], 0x12345678),
        ("int32", [0xFFFF, 0xFFFF], -1),
        ("float32", [0x41A8, 0x0000], 21.0),
        ("hex32", [0xDEAD, 0xBEEF], 0xDEADBEEF),
        ("uint64", [0, 0, 0x1234, 0x5678], 0x0000000012345678),
        ("int64", [0xFFFF, 0xFFFF, 0xFFFF, 0xFFFF], -1),
    ],
)
def test_byte_convert_decode(spec, raw, decoded) -> None:
    adapter = byte_convert_adapter(spec)
    result = adapter.decode(raw)
    if spec.startswith("float"):
        assert result == pytest.approx(decoded, rel=1e-6)
    elif spec.startswith("hex"):
        assert int(str(result), 16) == decoded
    else:
        assert result == decoded


@pytest.mark.parametrize(
    ("spec", "value", "expected_len"),
    [
        ("uint16", 123, 1),
        ("int16", -1, 1),
        ("bool", True, 1),
        ("uint32", 0x12345678, 2),
        ("int32", -1, 2),
        ("float32", 21.0, 2),
        ("hex32", "0xDEADBEEF", 2),
        ("uint64", 0x12345678, 4),
        ("int64", -1, 4),
        ("float64", 21.0, 4),
        ("hex64", "DEADBEEF", 4),
    ],
)
def test_byte_convert_encode_roundtrip_length(spec, value, expected_len) -> None:
    adapter = byte_convert_adapter(spec)
    raw = adapter.encode(value)
    if expected_len == 1:
        assert isinstance(raw, int)
    else:
        assert isinstance(raw, list)
        assert len(raw) == expected_len
        # Decode back and compare, where meaningful.
        decoded = adapter.decode(raw)
        if spec.startswith("float"):
            assert decoded == pytest.approx(value, rel=1e-6)
        elif spec.startswith("hex"):
            assert int(str(decoded), 16) == int(str(value).replace("0x", ""), 16)
        else:
            assert decoded == value


def test_byte_convert_invalid_register_length() -> None:
    adapter = byte_convert_adapter("uint32")
    with pytest.raises(ValueError, match="expected 2 registers"):
        adapter.decode([1])


def test_byte_convert_unsupported_type() -> None:
    with pytest.raises(ValueError, match="Unsupported byte_convert type"):
        byte_convert_adapter("unknown_type")
