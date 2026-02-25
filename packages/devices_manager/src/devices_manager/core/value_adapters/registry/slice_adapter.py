from models.errors import InvalidError

from devices_manager.core.value_adapters.fn_adapter import FnAdapter


def _parse_slice_string(argument: str) -> slice:
    stripped_arg = argument.strip()
    if not stripped_arg:
        msg = "Empty slice argument"
        raise ValueError(msg)
    return slice(*[int(p) if p else None for p in stripped_arg.split(":")])


def slice_adapter(argument: str) -> FnAdapter:
    try:
        s = _parse_slice_string(argument)
    except Exception as e:
        msg = (
            f"Invalid slice format: {argument}. Expected format: start:end:step with "
            f"integers or empty values"
        )
        raise InvalidError(msg) from e

    return FnAdapter(decoder=lambda value: value[s])
