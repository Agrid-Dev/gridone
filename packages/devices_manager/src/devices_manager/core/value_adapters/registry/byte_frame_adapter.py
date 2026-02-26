from models.errors import InvalidError

from devices_manager.core.value_adapters.fn_adapter import FnAdapter


def _parse_argument(argument: str) -> bytes:
    try:
        return bytes.fromhex(argument.replace(" ", ""))
    except ValueError as e:
        msg = f"Expected hex prefix e.g. '11 05 00 13 00 55 20', got '{argument}'"
        raise ValueError(msg) from e


def byte_frame_adapter(argument: str) -> FnAdapter:
    """Decode: byte right after prefix -> int. Encode: prefix + bytes([int]).
    Argument format: hex prefix bytes e.g. '11 05 00 13 00 55 20'
    """
    try:
        prefix = _parse_argument(argument)
    except Exception as e:
        msg = f"Invalid byte_frame argument: '{argument}'"
        raise InvalidError(msg) from e

    index = len(prefix)

    def decode(value: bytes) -> int:
        return value[index]

    def encode(value: int) -> bytes:
        return prefix + bytes([value])

    return FnAdapter(decoder=decode, encoder=encode)
