from dataclasses import dataclass

from devices_manager.types import AttributeValueType


@dataclass(frozen=True, slots=True)
class ReadOk:
    address_id: str
    # Typed as AttributeValueType, but a transport whose wire format carries
    # structured data (e.g. OPC-UA ExtensionObjects/arrays) may set a
    # dict/list here instead — those call sites carry a `ty: ignore` until
    # this type is widened for such transports.
    value: AttributeValueType


@dataclass(frozen=True, slots=True)
class ReadError:
    address_id: str
    error: Exception


type ReadResult = ReadOk | ReadError
