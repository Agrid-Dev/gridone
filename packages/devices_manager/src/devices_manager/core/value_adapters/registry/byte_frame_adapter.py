from models.errors import InvalidError

from devices_manager.core.value_adapters.fn_adapter import FnAdapter

_EXPECTED_PARTS = 2


def _parse_argument(argument: str) -> tuple[int, bytes]:
    parts = argument.strip().split("|")
    if len(parts) != _EXPECTED_PARTS:
        msg = f"Expected 'index|hex_prefix', got '{argument}'"
        raise ValueError(msg)
    index = int(parts[0].strip())
    prefix = bytes.fromhex(parts[1].replace(" ", ""))
    return index, prefix


def byte_frame_adapter(argument: str) -> FnAdapter:
    """Decode: bytes[index] -> int. Encode: hex_prefix + bytes([int]).
    Argument format: 'index|hex_prefix' e.g. '7|11 05 00 13 00 55 20'
    """
    try:
        index, prefix = _parse_argument(argument)
    except Exception as e:
        msg = f"Invalid byte_frame argument: '{argument}'. Expected 'index|hex_prefix'"
        raise InvalidError(msg) from e

    def decode(value: bytes) -> int:
        return value[index]

    def encode(value: int) -> bytes:
        return prefix + bytes([value])

    return FnAdapter(decoder=decode, encoder=encode)
