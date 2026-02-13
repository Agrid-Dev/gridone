import struct

from devices_manager.core.value_adapters.fn_adapter import FnAdapter

_REGISTER_PAIR_LENGTH = 2


def _decode_registers(value: list[int]) -> float:
    """Decode two 16-bit registers into an IEEE 754 float32 (big endian)."""
    if len(value) != _REGISTER_PAIR_LENGTH:
        msg = "float32_registers adapter expects exactly 2 registers"
        raise ValueError(msg)
    high, low = value
    packed = struct.pack(">HH", high, low)
    return struct.unpack(">f", packed)[0]


def _encode_registers(value: float) -> list[int]:
    """Encode a float32 value into two 16-bit registers (big endian)."""
    packed = struct.pack(">f", value)
    high, low = struct.unpack(">HH", packed)
    return [high, low]


def float32_registers_adapter(raw: str) -> FnAdapter[list[int], float]:  # noqa: ARG001
    """Adapter for 32-bit float stored in two 16-bit registers."""
    return FnAdapter(decoder=_decode_registers, encoder=_encode_registers)
