import pytest
from devices_manager.core.value_adapters.registry.byte_convert_adapter import (
    byte_convert_adapter,
)
from devices_manager.core.value_adapters.registry.byte_slice_adapter import (
    byte_slice_adapter,
)
from devices_manager.core.value_adapters.registry.scale_adapter import scale_adapter


@pytest.mark.parametrize(
    ("spec", "raw", "decoded"),
    [
        ("uint16", 123, 123),
        ("int16", 0xFFFF, -1),
        ("bool", 0, False),
        ("bool", 1, True),
        ("uint32", [0x5678, 0x1234], 0x12345678),
        ("int32", [0xFFFF, 0xFFFF], -1),
        ("float32", [0x0000, 0x41A8], 21.0),
        ("hex32", [0xBEEF, 0xDEAD], 0xDEADBEEF),
        ("uint64", [0x5678, 0x1234, 0, 0], 0x0000000012345678),
        ("int64", [0xFFFF, 0xFFFF, 0xFFFF, 0xFFFF], -1),
        ("float32 big_endian", [0x41A8, 0x0000], 21.0),
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
        ("float32 big_endian", 21.0, 2),
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


@pytest.mark.parametrize(
    ("raw", "decoded"),
    [
        ([42416, 16922], 38.66180419921875),
        ([10028, 16644], 8.259563446044922),
        ([35681, 16923], 38.886112213134766),
    ],
)
def test_byte_convert_float32_little_endian_decode(raw, decoded) -> None:
    adapter = byte_convert_adapter("float32 little_endian")
    result = adapter.decode(raw)
    assert result == pytest.approx(decoded, rel=1e-6)


@pytest.mark.parametrize(
    ("spec", "value"),
    [
        ("float32 little_endian", 21.0),
        ("uint32 little_endian", 0x12345678),
    ],
)
def test_byte_convert_little_endian_roundtrip(spec, value) -> None:
    adapter = byte_convert_adapter(spec)
    raw = adapter.encode(value)
    assert isinstance(raw, list)
    assert len(raw) == 2
    decoded = adapter.decode(raw)
    if isinstance(value, float):
        assert decoded == pytest.approx(value, rel=1e-6)
    else:
        assert decoded == value


def test_byte_convert_endian_variants() -> None:
    le_default = byte_convert_adapter("float32")
    be_explicit = byte_convert_adapter("float32 big_endian")
    le_explicit = byte_convert_adapter("float32 little_endian")

    regs_be = [0x41A8, 0x0000]  # 21.0 in big-endian
    regs_le = list(reversed(regs_be))

    assert le_default.decode(regs_le) == pytest.approx(21.0, rel=1e-6)
    assert be_explicit.decode(regs_be) == pytest.approx(21.0, rel=1e-6)
    assert le_explicit.decode(regs_le) == pytest.approx(21.0, rel=1e-6)


def test_byte_convert_invalid_endianness() -> None:
    with pytest.raises(ValueError, match="Unsupported byte order"):
        byte_convert_adapter("float32 middle")


# --- bytes input support ---


@pytest.mark.parametrize(
    ("spec", "raw_bytes", "decoded"),
    [
        ("int16 big_endian", b"\x08\xce", 2254),
        ("int16 big_endian", b"\xfe\x0c", -500),
        ("uint16 big_endian", b"\x08\xe8", 2280),
        ("uint16 big_endian", b"\x00\x16", 22),
        ("uint16 big_endian", b"\x06\xbe", 1726),
    ],
)
def test_byte_convert_from_bytes(spec, raw_bytes, decoded) -> None:
    adapter = byte_convert_adapter(spec)
    assert adapter.decode(raw_bytes) == decoded


def test_byte_convert_bytes_wrong_length() -> None:
    adapter = byte_convert_adapter("int16 big_endian")
    with pytest.raises(ValueError, match="expected 2 bytes"):
        adapter.decode(b"\x08")


@pytest.mark.parametrize(
    ("spec", "raw", "decoded"),
    [
        ("uint8", b"\x32", 50),
        ("uint8", b"\x00", 0),
        ("uint8", b"\xff", 255),
        ("int8", b"\x7f", 127),
        ("int8", b"\x80", -128),
        ("int8", b"\xff", -1),
    ],
)
def test_byte_convert_uint8_int8_from_bytes(spec, raw, decoded) -> None:
    adapter = byte_convert_adapter(spec)
    assert adapter.decode(raw) == decoded


def test_byte_convert_uint8_wrong_length() -> None:
    adapter = byte_convert_adapter("uint8")
    with pytest.raises(ValueError, match="expected 1 registers"):
        adapter.decode(b"\x00\x01")


def test_byte_convert_int8_wrong_length() -> None:
    adapter = byte_convert_adapter("int8")
    with pytest.raises(ValueError, match="expected 1 registers"):
        adapter.decode(b"\x00\x01")


_ELSYS_PAYLOAD = bytes(
    [
        0x01,
        0x08,
        0xCE,  # temperature: int16 2254 => 22.54 °C
        0x02,
        0x32,  # humidity: uint8 50
        0x04,
        0x08,
        0xE8,  # co2: uint16 2280
        0x05,
        0x00,  # motion: uint8 0
        0x06,
        0x00,
        0x16,  # light: uint16 22
        0x07,
        0x06,
        0xBE,  # battery: uint16 1726 mV
    ]
)


def test_byte_slice_then_byte_convert_temperature() -> None:
    pipeline = (
        byte_slice_adapter("1:3")
        + byte_convert_adapter("int16 big_endian")
        + scale_adapter(0.01)
    )
    assert pipeline.decode(_ELSYS_PAYLOAD) == pytest.approx(22.54)


def test_byte_slice_then_byte_convert_humidity() -> None:
    pipeline = byte_slice_adapter("4:5") + byte_convert_adapter("uint8")
    assert pipeline.decode(_ELSYS_PAYLOAD) == 50


def test_byte_slice_then_byte_convert_co2() -> None:
    pipeline = byte_slice_adapter("6:8") + byte_convert_adapter("uint16 big_endian")
    assert pipeline.decode(_ELSYS_PAYLOAD) == 2280
