from dataclasses import dataclass, field
from datetime import UTC, datetime

from .types import DATA_TYPES, AttributeValueType, DataType, ReadWriteMode


@dataclass(frozen=True)
class Attribute:
    name: str
    data_type: DataType
    read_write_modes: set[ReadWriteMode]
    current_value: AttributeValueType | None
    last_updated: datetime | None = field(default=None)

    def _ensure_type(self, value: AttributeValueType | None) -> None:
        if value is not None and not isinstance(value, DATA_TYPES[self.data_type]):
            msg = (
                f"Value for attribute '{self.name}' must be of type "
                f"'{self.data_type.value}', got '{type(value).__name__}'"
            )
            raise TypeError(
                msg,
            )

    def __post_init__(self) -> None:
        self._ensure_type(self.current_value)

    def update_value(self, new_value: AttributeValueType) -> None:
        self._ensure_type(new_value)
        object.__setattr__(self, "current_value", new_value)
        object.__setattr__(self, "last_updated", datetime.now(UTC))
