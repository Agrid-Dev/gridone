from abc import ABC, abstractmethod
from typing import TypeVar

from core.types import AttributeValueType

type InputDict = dict

Device_T = TypeVar("Device_T", dict, float, bool, str, AttributeValueType)
Core_T = TypeVar("Core_T", int, float, bool, str, AttributeValueType)


class ValueParser[Device_T, Core_T](ABC):
    @abstractmethod
    def __init__(self, raw: str) -> None: ...

    @abstractmethod
    def parse(self, value: Device_T) -> Core_T: ...


class ReversibleValueParser(ValueParser[Device_T, Core_T]):
    @abstractmethod
    def revert(self, value: Core_T) -> Device_T: ...
