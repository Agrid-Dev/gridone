from abc import ABC, abstractmethod
from typing import TypeVar

from core.types import AttributeValueType

type InputDict = dict

T = TypeVar("T", dict, float, bool, str, AttributeValueType)


class ValueParser[T](ABC):
    @abstractmethod
    def __init__(self, raw: str) -> None: ...

    @abstractmethod
    def parse(self, value: T) -> AttributeValueType: ...


class ReversibleValueParser(ValueParser[T]):
    @abstractmethod
    def revert(self, value: AttributeValueType) -> T: ...
