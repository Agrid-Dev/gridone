from typing import Annotated

from pydantic import Field, TypeAdapter

from devices_manager.core.codecs.fn_codec import FnCodec
from devices_manager.core.codecs.invalid_sample import InvalidSampleError
from models.conditions import scalar_equal
from models.expressions import MAX_LIST_ITEMS, Scalar

_VALUES = TypeAdapter(
    Annotated[list[Scalar], Field(min_length=1, max_length=MAX_LIST_ITEMS)]
)


def invalid_values_codec(argument: list[Scalar]) -> FnCodec:
    """Reject declared sentinels at this point in the composed decode pipeline.

    Put this after extraction and before scaling to recognize a wire sentinel.
    It never treats all negative numbers as invalid, and never changes writes.
    """
    sentinels = _VALUES.validate_python(argument)

    def decode(value: Scalar) -> Scalar:
        if any(scalar_equal(value, sentinel) for sentinel in sentinels):
            msg = "Device reported an invalid measurement"
            raise InvalidSampleError(msg)
        return value

    return FnCodec(decoder=decode)
