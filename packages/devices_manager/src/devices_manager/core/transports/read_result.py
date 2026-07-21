from dataclasses import dataclass

from devices_manager.types import AttributeValueType


@dataclass(frozen=True, slots=True)
class ReadOk:
    address_id: str
    value: AttributeValueType


@dataclass(frozen=True, slots=True)
class ReadError:
    address_id: str
    error: Exception


type ReadResult = ReadOk | ReadError
