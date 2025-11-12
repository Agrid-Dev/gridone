from enum import StrEnum
from typing import Literal

AttributeValueType = int | float | str | bool

ReadWriteMode = Literal["read", "write"]


class DataType(StrEnum):
    INT = "int"
    FLOAT = "float"
    STRING = "str"
    BOOL = "bool"


DATA_TYPES: dict[DataType, type] = {
    DataType.INT: int,
    DataType.FLOAT: float,
    DataType.STRING: str,
    DataType.BOOL: bool,
}


class TransportProtocols(StrEnum):
    BACNET = "bacnet"
    MODBUS_TCP = "modbus-tcp"
    HTTP = "http"
    MQTT = "mqtt"


type DeviceConfig = dict[str, str]
