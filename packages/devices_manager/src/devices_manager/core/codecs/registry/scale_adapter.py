from devices_manager.core.codecs.fn_codec import FnCodec


def scale_adapter(scale: float) -> FnCodec[float, float]:
    return FnCodec(decoder=lambda x: x * scale, encoder=lambda x: x / scale)
