from core.value_adapters.fn_adapter import FnAdapter


def scale_adapter(scale: float) -> FnAdapter[float, float]:
    return FnAdapter(decoder=lambda x: x * scale, encoder=lambda x: x / scale)
