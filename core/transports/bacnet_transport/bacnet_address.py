import re
from enum import StrEnum

from pydantic import BaseModel, PositiveInt

from core.transports.transport_address import RawTransportAddress, TransportAddress

DEFAULT_PROPERTY_NAME = "present-value"  # use dash form


class BacnetObjectType(StrEnum):
    """Object type enumeration using values as in bacpypes 3.
    Not exhaustive."""

    BINARY_VALUE = "binary-value"
    BINARY_INPUT = "binary-input"
    ANALOG_VALUE = "analog-value"
    ANALOG_INPUT = "analog-input"
    MULTISTATE_VALUE = "multistate-value"
    MULTISTATE_INPUT = "multistate-input"


def initials(s: str) -> str:
    """Returns capital case initials of words.
    eg: binary-value -> BI"""
    return "".join(w[0].upper() for w in s.split("-") if len(w) > 0)


def bacnet_object_type_from_raw(raw: str) -> BacnetObjectType:
    as_full = raw.strip().lower().replace("_", "-")
    if as_full in BacnetObjectType:
        return BacnetObjectType(as_full)
    as_initials = raw.strip().upper()
    for object_type in BacnetObjectType:
        if as_initials == initials(object_type):
            return object_type
    msg = f"Invalid bacnet object type: '{raw}'"
    raise ValueError(msg)


bacnet_object_regex = r"^([A-Za-z-_]+)[\s:-]*(\d+)$"


class BacnetAddress(BaseModel, TransportAddress):
    object_type: BacnetObjectType
    object_instance: PositiveInt
    property_name: str = DEFAULT_PROPERTY_NAME

    @classmethod
    def from_dict(cls, address: dict) -> "BacnetAddress":
        try:
            return cls(
                object_type=bacnet_object_type_from_raw(address["object_type"]),
                object_instance=int(address["object_instance"]),
            )
        except (KeyError, ValueError) as e:
            msg = f"Invalid Modbus address: {address}"
            raise ValueError(msg) from e

    @classmethod
    def from_str(cls, address: str) -> "BacnetAddress":
        match = re.fullmatch(bacnet_object_regex, address.strip())
        if match is None:
            msg = f"Invalid Modbus address format: {address}"
            raise ValueError(msg)
        groups = match.groups()
        if len(groups) != 2:  # noqa: PLR2004
            msg = f"Invalid Modbus address format: {address}"
            raise ValueError(msg)
        object_type = bacnet_object_type_from_raw(match.group(1))
        object_instance = int(match.group(2))
        return cls(object_type=object_type, object_instance=object_instance)

    @classmethod
    def from_raw(cls, raw_address: RawTransportAddress) -> "BacnetAddress":
        if isinstance(raw_address, str):
            return cls.from_str(raw_address)
        if isinstance(raw_address, dict):
            return cls.from_dict(raw_address)
        msg = "Invalid raw address type"
        raise ValueError(msg)
