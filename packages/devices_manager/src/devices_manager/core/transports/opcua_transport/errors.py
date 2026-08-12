import struct

from asyncua import ua


class OpcuaNotConnectedError(ConnectionError):
    """Raised when a read/write is attempted without a live session."""


def translate_write_error(exc: Exception) -> Exception:
    """A value out of range for its target type (e.g. 100000 into an Int16)
    fails ``struct`` encoding before any OPC-UA status code exists, and
    asyncua wraps it in a generic ``Exception`` (chained as ``__cause__``)
    rather than a typed one — re-raised here as ``BadTypeMismatch``."""
    cause = exc.__cause__
    if isinstance(exc, struct.error | OverflowError) or isinstance(
        cause, struct.error | OverflowError
    ):
        return ua.uaerrors.BadTypeMismatch(str(exc))
    return exc
