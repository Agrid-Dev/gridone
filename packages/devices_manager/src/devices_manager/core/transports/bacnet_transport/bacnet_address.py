import re
from typing import Annotated

from pydantic import BaseModel, BeforeValidator, Field, NonNegativeInt, PositiveInt

from devices_manager.core.transports.transport_address import (
    RawTransportAddress,
    TransportAddress,
)

from .bacnet_types import BacnetObjectType, BacnetWritePriority

DEFAULT_PROPERTY_NAME = "present-value"  # use dash form


# Driver shorthands (e.g. "AV0", "MV1") — explicit because "multi-state-value"
# is abbreviated "MV", not the "MSV" its initials would give.
_OBJECT_TYPE_BY_SHORTHAND = {
    "AI": BacnetObjectType.ANALOG_INPUT,
    "AV": BacnetObjectType.ANALOG_VALUE,
    "BI": BacnetObjectType.BINARY_INPUT,
    "BV": BacnetObjectType.BINARY_VALUE,
    "MI": BacnetObjectType.MULTISTATE_INPUT,
    "MV": BacnetObjectType.MULTISTATE_VALUE,
}


def bacnet_object_type_from_raw(raw: str) -> BacnetObjectType:
    as_full = raw.strip().lower().replace("_", "-")
    if as_full in BacnetObjectType:
        return BacnetObjectType(as_full)
    shorthand = _OBJECT_TYPE_BY_SHORTHAND.get(raw.strip().upper())
    if shorthand is not None:
        return shorthand
    msg = f"Invalid bacnet object type: '{raw}'"
    raise ValueError(msg)


bacnet_object_regex = r"^([A-Za-z-_]+)[\s:-]*(\d+)"
bacnet_write_priority_regex = r"P(\d{1,2})"


class BacnetAddress(BaseModel, TransportAddress):
    device_instance: PositiveInt = Field(
        description=(
            "Numeric ID of the BACnet device that owns this object (its Device "
            "object's instance number, e.g. 1001). Identifies *which* device on "
            "the network; supplied by the device config, not the address string."
        )
    )
    object_type: Annotated[
        BacnetObjectType,
        BeforeValidator(bacnet_object_type_from_raw),
        Field(
            description=(
                "Kind of datapoint. 'analog-*' carries a number, 'binary-*' an "
                "on/off, 'multi-state-*' an enumerated state. '*-input' is a "
                "read-only sensor reading; '*-value' is a writable setpoint. "
                "Accepts canonical names ('analog-value'), shorthands ('AV') or "
                "underscores ('analog_value')."
            )
        ),
    ]
    object_instance: NonNegativeInt = Field(
        description=(
            "Index of the object within its type on the device, starting at 0 "
            "(e.g. 'analog-value 0' vs 'analog-value 1'). Together with "
            "object_type it pinpoints one datapoint."
        )
    )
    property_name: str = Field(
        default=DEFAULT_PROPERTY_NAME,
        description=(
            "Property of the object to read/write. Almost always 'present-value' "
            "(the live reading or setpoint). Use the dash form."
        ),
    )
    write_priority: BacnetWritePriority | None = Field(
        default=None,
        description=(
            "BACnet write priority, 5-16 (lower number = higher precedence). A "
            "write only sticks if no higher-priority slot already commands the "
            "object. None falls back to the transport's default_write_priority. "
            "Ignored on reads."
        ),
    )

    @property
    def id(self) -> str:
        result = (
            f"bacnet-device{self.device_instance}"
            f"@{self.object_type}:{self.object_instance}-{self.property_name}"
        )
        if self.write_priority is not None:
            result += f"/wp{self.write_priority}"
        return result

    @classmethod
    def from_dict(
        cls, address_dict: dict, extra_context: dict | None = None
    ) -> "BacnetAddress":
        combined_context = {**address_dict, **(extra_context or {})}
        return cls(**combined_context)

    @classmethod
    def from_str(
        cls, address_str: str, extra_context: dict | None = None
    ) -> "BacnetAddress":
        extra_context = extra_context or {}
        if not extra_context.get("device_instance"):
            msg = "device_instance is required"
            raise ValueError(msg)
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
        device_instance = extra_context["device_instance"]
        return cls(
            object_type=object_type,
            object_instance=object_instance,
            write_priority=write_priority,
            device_instance=int(device_instance),
        )

    @classmethod
    def from_raw(
        cls, raw_address: RawTransportAddress, extra_context: dict | None = None
    ) -> "BacnetAddress":
        if isinstance(raw_address, str):
            return cls.from_str(raw_address, extra_context)
        if isinstance(raw_address, dict):
            return cls.from_dict(raw_address, extra_context)
        msg = "Invalid raw address type"
        raise ValueError(msg)
