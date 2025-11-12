from core.types import AttributeValueType


def scale_parser(raw_value: float, scale: float) -> AttributeValueType:
    return raw_value * scale
