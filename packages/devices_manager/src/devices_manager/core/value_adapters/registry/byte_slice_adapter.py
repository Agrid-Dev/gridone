from devices_manager.core.value_adapters.fn_adapter import FnAdapter


def byte_slice_adapter(argument: str | dict) -> FnAdapter:
    slice_spec = argument if isinstance(argument, str) else argument["slice"]
    s = slice(*[int(p) if p else None for p in slice_spec.split(":")])
    return FnAdapter(decoder=lambda value: value[s])
