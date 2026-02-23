import base64

from devices_manager.core.value_adapters.fn_adapter import FnAdapter
from devices_manager.types import AttributeValueType

# type_byte -> (field_name, byte_length, scale, signed)
_ELSYS_TYPES: dict[int, tuple[str, int, float, bool]] = {
    0x01: ("temperature", 2, 0.01, True),
    0x02: ("humidity",    1, 1,    False),
    0x04: ("co2",         2, 1,    False),
    0x05: ("motion",      1, 1,    False),
    0x06: ("light",       2, 1,    False),
    0x07: ("battery_mv",  2, 1,    False),
}


def _parse_elsys_tlv(data: bytes) -> dict[str, float]:
    result: dict[str, float] = {}
    i = 0
    while i < len(data):
        t = data[i]
        i += 1
        if t not in _ELSYS_TYPES:
            break
        name, length, scale, signed = _ELSYS_TYPES[t]
        value = int.from_bytes(data[i : i + length], "big", signed=signed) * scale
        result[name] = round(value, 3)
        i += length
    return result


def lorawan_elsys_adapter(field_name: str) -> FnAdapter[str, AttributeValueType]:
    """Decode a base64 Elsys TLV payload and extract the named field."""

    def decode(value: str) -> AttributeValueType:
        raw = base64.b64decode(value)
        fields = _parse_elsys_tlv(raw)
        return fields[field_name]

    return FnAdapter(decoder=decode)
