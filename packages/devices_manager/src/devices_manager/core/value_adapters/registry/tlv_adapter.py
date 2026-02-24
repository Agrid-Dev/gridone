import base64
from collections.abc import Callable

from jsonpath import pointer

from devices_manager.core.value_adapters.fn_adapter import FnAdapter
from devices_manager.types import AttributeValueType

# byte -> (field, length, scale, signed)
TlvTypeMap = dict[int, tuple[str, int, float, bool]]


def build_tlv_adapter(tlv_types: TlvTypeMap) -> Callable[[str], FnAdapter]:
    """Return a tlv value adapter pre-configured with the given type map."""

    def tlv_adapter(field_pointer: str) -> FnAdapter[str, AttributeValueType]:
        def decode(value: str) -> AttributeValueType:
            raw = base64.b64decode(value)
            result: dict[str, float] = {}
            i = 0
            while i < len(raw):
                t = raw[i]
                i += 1
                if t not in tlv_types:
                    break
                field, length, scale, signed = tlv_types[t]
                val = int.from_bytes(raw[i : i + length], "big", signed=signed) * scale
                result[field] = round(val, 3)
                i += length
            return pointer.resolve(field_pointer, result)

        return FnAdapter(decoder=decode)

    return tlv_adapter
