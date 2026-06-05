from enum import StrEnum
from typing import Literal

from models.types import AttributeValueType, DataType

ReadWriteMode = Literal["read", "write"]


class ConnectionStatus(StrEnum):
    IDLE = "idle"
    OK = "ok"
    DEGRADED = "degraded"
    ERROR = "error"


class DeviceKind(StrEnum):
    PHYSICAL = "physical"
    VIRTUAL = "virtual"


class TransportType(StrEnum):
    PULL = "pull"
    PUSH = "push"


class TransportProtocols(StrEnum):
    BACNET = "bacnet"
    MODBUS_TCP = "modbus-tcp"
    HTTP = "http"
    KNX = "knx"
    MQTT = "mqtt"


type DeviceConfig = dict[str, str | int | float | bool]

__all__ = [
    "AttributeValueType",
    "ConnectionStatus",
    "DataType",
    "DeviceConfig",
    "DeviceKind",
    "ReadWriteMode",
    "TransportProtocols",
    "TransportType",
]
