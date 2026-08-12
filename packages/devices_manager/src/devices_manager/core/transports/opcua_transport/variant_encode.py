from asyncua import ua

from devices_manager.types import AttributeValueType

_NUMERIC_VARIANT_TYPES = frozenset(
    {
        ua.VariantType.SByte,
        ua.VariantType.Byte,
        ua.VariantType.Int16,
        ua.VariantType.UInt16,
        ua.VariantType.Int32,
        ua.VariantType.UInt32,
        ua.VariantType.Int64,
        ua.VariantType.UInt64,
    }
)
_FLOAT_VARIANT_TYPES = frozenset({ua.VariantType.Float, ua.VariantType.Double})


def coerce_for_write(
    value: AttributeValueType, variant_type: ua.VariantType
) -> AttributeValueType:
    """Coerce a Python value to the server-declared variant type before
    write, e.g. an Int16 where the attribute layer only carries a plain int.
    Out-of-range values aren't caught here; they fail on the wire write."""
    if variant_type in _NUMERIC_VARIANT_TYPES:
        return int(value)
    if variant_type in _FLOAT_VARIANT_TYPES:
        return float(value)
    if variant_type == ua.VariantType.Boolean:
        return bool(value)
    return value
