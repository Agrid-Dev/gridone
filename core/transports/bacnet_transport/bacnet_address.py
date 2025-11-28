import re
from typing import Annotated

from pydantic import BaseModel, BeforeValidator, PositiveInt

from core.transports.transport_address import RawTransportAddress, TransportAddress

from .bacnet_types import BacnetObjectType, BacnetWritePriority

DEFAULT_PROPERTY_NAME = "present-value"  # use dash form


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


bacnet_object_regex = r"^([A-Za-z-_]+)[\s:-]*(\d+)"
bacnet_write_priority_regex = r"P(\d{1,2})"


class BacnetAddress(BaseModel, TransportAddress):
    object_type: Annotated[
        BacnetObjectType, BeforeValidator(bacnet_object_type_from_raw)
    ]
    object_instance: PositiveInt
    property_name: str = DEFAULT_PROPERTY_NAME
    write_priority: BacnetWritePriority | None = None

    @classmethod
    def from_dict(cls, address_dict: dict) -> "BacnetAddress":
        return cls(**address_dict)

    @classmethod
    def from_str(cls, address_str: str) -> "BacnetAddress":
        match = re.match(bacnet_object_regex, address_str.strip())
        if match is None:
            msg = f"Invalid Bacnet address format: {address_str}"
            raise ValueError(msg)
        groups = match.groups()
        if len(groups) != 2:  # noqa: PLR2004
            msg = f"Invalid Bacnet address format: {address_str}"
            raise ValueError(msg)
        object_type = bacnet_object_type_from_raw(match.group(1))
        object_instance = int(match.group(2))
        write_priority_match = re.search(bacnet_write_priority_regex, address_str)

        write_priority = (
            int(write_priority_match.group(1)) if write_priority_match else None
        )
        return cls(
            object_type=object_type,
            object_instance=object_instance,
            write_priority=write_priority,
        )

    @classmethod
    def from_raw(cls, raw_address: RawTransportAddress) -> "BacnetAddress":
        if isinstance(raw_address, str):
            return cls.from_str(raw_address)
        if isinstance(raw_address, dict):
            return cls.from_dict(raw_address)
        msg = "Invalid raw address type"
        raise ValueError(msg)
