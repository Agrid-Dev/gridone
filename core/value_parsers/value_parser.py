from collections.abc import Callable

from core.types import AttributeValueType

type InputDict = dict

type DictValueParser = Callable[[InputDict], AttributeValueType]
type FloatValueParser = Callable[[float], AttributeValueType]

type ValueParser = DictValueParser | FloatValueParser
