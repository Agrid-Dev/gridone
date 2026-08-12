import dataclasses

from asyncua import ua

from devices_manager.types import AttributeValueType


def decode_variant(variant: ua.Variant) -> AttributeValueType | dict | list:
    """Scalars/arrays pass through unchanged (asyncua already decodes them
    to native Python types). ExtensionObject is reduced to a plain dict,
    recursively, so ``json_pointer`` can index into it, e.g. a Variant
    carrying an ``Argument`` struct decodes to ``{"Name": "x", ...}``."""
    if variant.VariantType == ua.VariantType.ExtensionObject:
        return _decode_extension_object(variant.Value)  # ty: ignore[invalid-return-type]
    return variant.Value


def _decode_extension_object(value: object) -> object:
    if dataclasses.is_dataclass(value) and not isinstance(value, type):
        return {
            field.name: _decode_extension_object(getattr(value, field.name))
            for field in dataclasses.fields(value)
        }
    if isinstance(value, list):
        return [_decode_extension_object(v) for v in value]
    return value
