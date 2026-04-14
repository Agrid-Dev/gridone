from devices_manager.core.codecs.fn_codec import FnCodec
from models.errors import InvalidError


def _parse_slice_string(argument: str) -> slice:
    stripped_arg = argument.strip()
    if not stripped_arg:
        msg = "Empty slice argument"
        raise ValueError(msg)
    return slice(*[int(p) if p else None for p in stripped_arg.split(":")])


def slice_adapter(argument: str) -> FnCodec:
    try:
        s = _parse_slice_string(argument)
    except Exception as e:
        msg = (
            f"Invalid slice format: {argument}. Expected format: start:end:step with "
            f"integers or empty values"
        )
        raise InvalidError(msg) from e

    return FnCodec(decoder=lambda value: value[s])
