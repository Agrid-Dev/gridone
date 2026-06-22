from devices_manager.core.codecs.fn_codec import FnCodec


def offset_codec(offset: float) -> FnCodec[float, float]:
    return FnCodec(decoder=lambda x: x + offset, encoder=lambda x: x - offset)
