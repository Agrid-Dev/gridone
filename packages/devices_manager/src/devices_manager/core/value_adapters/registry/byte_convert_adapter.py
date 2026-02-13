import struct
from collections.abc import Callable, Sequence

from devices_manager.core.value_adapters.fn_adapter import FnAdapter

_REGISTER_BYTES = 2
_ONE_REGISTER = 1
_TWO_REGISTERS = 2
_FOUR_REGISTERS = 4
_UINT16_MAX = 0xFFFF
_INT16_MIN = -0x8000
_INT16_MAX = 0x7FFF
_UINT32_MAX = 0xFFFFFFFF
_INT32_MIN = -0x8000_0000
_INT32_MAX = 0x7FFF_FFFF
_UINT64_MAX = 0xFFFFFFFF_FFFFFFFF
_INT64_MIN = -0x8000_0000_0000_0000
_INT64_MAX = 0x7FFF_FFFF_FFFF_FFFF


def _ensure_registers(value: int | Sequence[int], expected_registers: int) -> list[int]:
    """Normalize raw register input to a list[int] and validate length."""
    if isinstance(value, int):
        # Backwards-compatible: single-register values may be plain ints.
        registers = [value]
    elif isinstance(value, Sequence) and all(isinstance(v, int) for v in value):
        registers = list(value)
    else:
        msg = f"Unsupported register value type: {type(value)}"
        raise TypeError(msg)

    if len(registers) != expected_registers:
        msg = (
            f"byte_convert expected {expected_registers} registers, "
            f"got {len(registers)}"
        )
        raise ValueError(msg)
    return registers


def _to_bytes(registers: list[int]) -> bytes:
    for reg in registers:
        if reg < 0 or reg > _UINT16_MAX:
            msg = f"Register value {reg} out of 16-bit range"
            raise ValueError(msg)
    return struct.pack(">" + "H" * len(registers), *registers)


def _from_bytes(data: bytes) -> list[int]:
    if len(data) % _REGISTER_BYTES != 0:
        msg = "Byte length must be a multiple of 2"
        raise ValueError(msg)
    count = len(data) // _REGISTER_BYTES
    return list(struct.unpack(">" + "H" * count, data))


def _decode_uint16(value: int | Sequence[int]) -> int:
    registers = _ensure_registers(value, _ONE_REGISTER)
    reg = registers[0]
    if reg < 0 or reg > _UINT16_MAX:
        msg = f"Value {reg} out of range for uint16"
        raise ValueError(msg)
    return reg


def _encode_uint16(value: int) -> int:
    if value < 0 or value > _UINT16_MAX:
        msg = f"Value {value} out of range for uint16"
        raise ValueError(msg)
    return value


def _decode_int16(value: int | Sequence[int]) -> int:
    reg = _decode_uint16(value)
    if reg & 0x8000:
        return reg - (_UINT16_MAX + 1)
    return reg


def _encode_int16(value: int) -> int:
    if value < _INT16_MIN or value > _INT16_MAX:
        msg = f"Value {value} out of range for int16"
        raise ValueError(msg)
    if value < 0:
        return value + 0x10000
    return value


def _decode_bool(value: int | Sequence[int]) -> bool:
    reg = _decode_uint16(value)
    return bool(reg)


def _encode_bool(value: bool) -> int:  # noqa: FBT001
    return 1 if value else 0


def _decode_uint32(value: int | Sequence[int]) -> int:
    registers = _ensure_registers(value, _TWO_REGISTERS)
    data = _to_bytes(registers)
    return struct.unpack(">I", data)[0]


def _encode_uint32(value: int) -> list[int]:
    if value < 0 or value > _UINT32_MAX:
        msg = f"Value {value} out of range for uint32"
        raise ValueError(msg)
    data = struct.pack(">I", value)
    return _from_bytes(data)


def _decode_int32(value: int | Sequence[int]) -> int:
    registers = _ensure_registers(value, _TWO_REGISTERS)
    data = _to_bytes(registers)
    return struct.unpack(">i", data)[0]


def _encode_int32(value: int) -> list[int]:
    if value < _INT32_MIN or value > _INT32_MAX:
        msg = f"Value {value} out of range for int32"
        raise ValueError(msg)
    data = struct.pack(">i", value)
    return _from_bytes(data)


def _decode_float32(value: int | Sequence[int]) -> float:
    registers = _ensure_registers(value, _TWO_REGISTERS)
    data = _to_bytes(registers)
    return struct.unpack(">f", data)[0]


def _encode_float32(value: float) -> list[int]:
    data = struct.pack(">f", value)
    return _from_bytes(data)


def _decode_hex32(value: int | Sequence[int]) -> str:
    registers = _ensure_registers(value, _TWO_REGISTERS)
    data = _to_bytes(registers)
    int_value = struct.unpack(">I", data)[0]
    return f"{int_value:08X}"


def _encode_hex32(value: str) -> list[int]:
    value_str = value.strip().lower()
    value_str = value_str.removeprefix("0x")
    int_value = int(value_str, 16)
    return _encode_uint32(int_value)


def _decode_uint64(value: int | Sequence[int]) -> int:
    registers = _ensure_registers(value, _FOUR_REGISTERS)
    data = _to_bytes(registers)
    return struct.unpack(">Q", data)[0]


def _encode_uint64(value: int) -> list[int]:
    if value < 0 or value > _UINT64_MAX:
        msg = f"Value {value} out of range for uint64"
        raise ValueError(msg)
    data = struct.pack(">Q", value)
    return _from_bytes(data)


def _decode_int64(value: int | Sequence[int]) -> int:
    registers = _ensure_registers(value, _FOUR_REGISTERS)
    data = _to_bytes(registers)
    return struct.unpack(">q", data)[0]


def _encode_int64(value: int) -> list[int]:
    if value < _INT64_MIN or value > _INT64_MAX:
        msg = f"Value {value} out of range for int64"
        raise ValueError(msg)
    data = struct.pack(">q", value)
    return _from_bytes(data)


def _decode_float64(value: int | Sequence[int]) -> float:
    registers = _ensure_registers(value, _FOUR_REGISTERS)
    data = _to_bytes(registers)
    return struct.unpack(">d", data)[0]


def _encode_float64(value: float) -> list[int]:
    data = struct.pack(">d", value)
    return _from_bytes(data)


def _decode_hex64(value: int | Sequence[int]) -> str:
    registers = _ensure_registers(value, _FOUR_REGISTERS)
    data = _to_bytes(registers)
    int_value = struct.unpack(">Q", data)[0]
    return f"{int_value:016X}"


def _encode_hex64(value: str) -> list[int]:
    value_str = value.strip().lower()
    value_str = value_str.removeprefix("0x")
    int_value = int(value_str, 16)
    return _encode_uint64(int_value)


_DECODE_FUNCS: dict[str, Callable[[int | Sequence[int]], object]] = {
    "uint16": _decode_uint16,
    "int16": _decode_int16,
    "bool": _decode_bool,
    "uint32": _decode_uint32,
    "int32": _decode_int32,
    "float32": _decode_float32,
    "hex32": _decode_hex32,
    "uint64": _decode_uint64,
    "int64": _decode_int64,
    "float64": _decode_float64,
    "hex64": _decode_hex64,
}

_ENCODE_FUNCS = {
    "uint16": _encode_uint16,
    "int16": _encode_int16,
    "bool": _encode_bool,
    "uint32": _encode_uint32,
    "int32": _encode_int32,
    "float32": _encode_float32,
    "hex32": _encode_hex32,
    "uint64": _encode_uint64,
    "int64": _encode_int64,
    "float64": _encode_float64,
    "hex64": _encode_hex64,
}


def byte_convert_adapter(type_spec: str) -> FnAdapter[object, object]:
    """Reversible adapter for converting between registers and typed values.

    type_spec examples:
    - 'uint16', 'int16', 'bool'
    - 'uint32', 'int32', 'float32', 'hex32'
    - 'uint64', 'int64', 'float64', 'hex64'
    """
    spec = type_spec.strip().lower()
    decoder = _DECODE_FUNCS.get(spec)
    encoder = _ENCODE_FUNCS.get(spec)
    if not decoder or not encoder:
        supported = ", ".join(sorted(_DECODE_FUNCS.keys()))
        msg = f"Unsupported byte_convert type '{type_spec}'. Supported: {supported}"
        raise ValueError(msg)
    return FnAdapter(decoder=decoder, encoder=encoder)
