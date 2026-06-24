from devices_manager.core.codecs.fn_codec import FnCodec

MIN_BIT_INDEX = 0
MAX_BIT_INDEX = 15


def bit_codec(index: int) -> FnCodec[int, bool]:
    """Decode a single bit from a 16-bit register value.

    Used for "dry contact" (contact sec) bit images, where many booleans are
    packed into one holding register. ``index`` is the 0-based bit position
    within the register (``0`` = least significant bit, ``15`` = most
    significant).

    Decode does ``bool((register >> index) & 1)`` — e.g. register
    ``0b0000_0000_0000_0101`` decodes to ``True`` for index ``0`` or ``2`` and
    ``False`` for index ``1``.

    Read-only: a single bit cannot be written back into a register shared with
    other contacts without a read-modify-write, so the codec is non-reversible
    (encode falls back to identity and must not be relied on for writes).
    """
    if not MIN_BIT_INDEX <= index <= MAX_BIT_INDEX:
        msg = (
            f"bit index must be between {MIN_BIT_INDEX} and {MAX_BIT_INDEX}, "
            f"got {index}"
        )
        raise ValueError(msg)

    return FnCodec(decoder=lambda register: bool((register >> index) & 1))
