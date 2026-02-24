import base64

from jsonpath import pointer

from devices_manager.core.value_adapters.fn_adapter import FnAdapter
from devices_manager.types import AttributeValueType


def tlv_adapter(argument: dict) -> FnAdapter[str, AttributeValueType]:
    """
    Decode a base64-encoded binary TLV payload and extract one value.
    JSON pointer selecting the target field from the decoded dict
      types   — list of TLV field specs, each with:
                  byte   : TLV type byte (int)
                  field  : field name in the result dict
                  length : number of value bytes
                  scale  : multiplier applied to the raw integer (default 1)
                  signed : true if the integer is signed (default false)

    All device-specific knowledge lives in the driver YAML; this adapter is generic.
    """
    field_pointer: str = argument["pointer"]
    type_map = {
        entry["byte"]: (
            entry["field"],
            entry["length"],
            float(entry.get("scale", 1)),
            bool(entry.get("signed", False)),
        )
        for entry in argument["types"]
    }

    def decode(value: str) -> AttributeValueType:
        raw = base64.b64decode(value)
        result: dict[str, float] = {}
        i = 0
        while i < len(raw):
            t = raw[i]
            i += 1
            if t not in type_map:
                break
            field, length, scale, signed = type_map[t]
            val = int.from_bytes(raw[i : i + length], "big", signed=signed) * scale
            result[field] = round(val, 3)
            i += length
        return pointer.resolve(field_pointer, result)

    return FnAdapter(decoder=decode)
