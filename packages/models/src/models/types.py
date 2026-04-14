from enum import StrEnum

AttributeValueType = int | float | str | bool


class DataType(StrEnum):
    INT = "int"
    FLOAT = "float"
    STRING = "str"
    BOOL = "bool"


class SortOrder(StrEnum):
    ASC = "asc"
    DESC = "desc"


DATA_TYPE_MAP: dict[DataType, type] = {
    DataType.INT: int,
    DataType.FLOAT: float,
    DataType.STRING: str,
    DataType.BOOL: bool,
}

VALUE_TYPE_MAP: dict[type, DataType] = {v: k for k, v in DATA_TYPE_MAP.items()}
