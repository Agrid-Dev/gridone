from __future__ import annotations

from models.types import AttributeValueType, DataType

_BOOL_TRUE = {"true", "1"}
_BOOL_FALSE = {"false", "0"}


def deserialize_command_value(raw: str, data_type: DataType) -> AttributeValueType:
    """Convert a string-stored command value back to its native Python type."""
    if data_type == DataType.STRING:
        return raw
    if data_type == DataType.BOOL:
        lower = raw.lower()
        if lower in _BOOL_TRUE:
            return True
        if lower in _BOOL_FALSE:
            return False
        msg = f"Cannot deserialize {raw!r} as bool"
        raise ValueError(msg)
    if data_type == DataType.INT:
        return int(raw)
    if data_type == DataType.FLOAT:
        return float(raw)
    msg = f"Unknown data type: {data_type}"  # pragma: no cover
    raise ValueError(msg)  # pragma: no cover
