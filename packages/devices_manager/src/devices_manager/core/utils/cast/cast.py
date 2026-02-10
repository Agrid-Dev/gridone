from typing import Any

from devices_manager.types import AttributeValueType, DataType

from .bool import cast_as_bool
from .float import cast_as_float
from .int import cast_as_int
from .str import cast_as_str

casters = {
    DataType.BOOL: cast_as_bool,
    DataType.INT: cast_as_int,
    DataType.FLOAT: cast_as_float,
    DataType.STRING: cast_as_str,
}


def cast(raw_value: Any, data_type: DataType) -> AttributeValueType:  # noqa: ANN401
    try:
        return casters[data_type](raw_value)
    except KeyError as e:
        msg = f"Unknown data type: {data_type}"
        raise ValueError(msg) from e
