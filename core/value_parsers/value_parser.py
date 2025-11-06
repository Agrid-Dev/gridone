from collections.abc import Callable

from core.types import AttributeValueType

type InputDict = dict

type ValueParser = Callable[[InputDict], AttributeValueType]
