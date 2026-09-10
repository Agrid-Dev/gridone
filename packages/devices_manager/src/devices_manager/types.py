from enum import StrEnum
from typing import Literal

from models.types import AttributeValueType, DataType

ReadWriteMode = Literal["read", "write"]


class AttributeKind(StrEnum):
    """What an attribute is for: a plain value, a fault indicator, or a
    Gridone-internal attribute (e.g. connection status) with no transport
    address behind it."""

    STANDARD = "standard"
    FAULT = "fault"
    INTERNAL = "internal"


class ConnectionStatus(StrEnum):
    IDLE = "idle"
    OK = "ok"
    DEGRADED = "degraded"
    ERROR = "error"


class TransportType(StrEnum):
    PULL = "pull"
    PUSH = "push"


class TransportProtocols(StrEnum):
    BACNET = "bacnet"
    MODBUS_TCP = "modbus-tcp"
    MBUS = "mbus"
    HTTP = "http"
    KNX = "knx"
    MQTT = "mqtt"
    WEBHOOK = "webhook"
    OPCUA = "opcua"


type DeviceConfig = dict[str, str | int | float | bool]

__all__ = [
    "AttributeKind",
    "AttributeValueType",
    "ConnectionStatus",
    "DataType",
    "DeviceConfig",
    "ReadWriteMode",
    "TransportProtocols",
    "TransportType",
]
