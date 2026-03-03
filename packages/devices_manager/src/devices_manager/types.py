from enum import StrEnum
from typing import Literal

from models.types import AttributeValueType, DataType

ReadWriteMode = Literal["read", "write"]


class TransportProtocols(StrEnum):
    BACNET = "bacnet"
    MODBUS_TCP = "modbus-tcp"
    HTTP = "http"
    MQTT = "mqtt"


type DeviceConfig = dict[str, str | int | float | bool]

__all__ = [
    "AttributeValueType",
    "DataType",
    "DeviceConfig",
    "ReadWriteMode",
    "TransportProtocols",
]
