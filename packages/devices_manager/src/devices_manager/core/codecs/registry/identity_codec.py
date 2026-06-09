from devices_manager.core.codecs.fn_codec import FnCodec, identity


def identity_codec(raw: str) -> FnCodec:  # noqa: ARG001
    return FnCodec(encoder=identity, decoder=identity)
