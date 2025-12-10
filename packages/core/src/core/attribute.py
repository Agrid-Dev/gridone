from datetime import UTC, datetime

from pydantic import BaseModel

from .types import AttributeValueType, DataType, ReadWriteMode
from .utils.cast import cast


class Attribute(BaseModel):
    name: str
    data_type: DataType
    read_write_modes: set[ReadWriteMode]
    current_value: AttributeValueType | None
    last_updated: datetime | None = None

    def ensure_type(
        self,
        raw_value: AttributeValueType,
    ) -> AttributeValueType:
        if raw_value is not None:
            try:
                return cast(raw_value, self.data_type)
            except (ValueError, TypeError) as e:
                msg = (
                    f"Value for attribute '{self.name}' must be of type "
                    f"'{self.data_type.value}', got '{type(raw_value).__name__}'"
                )
                raise TypeError(
                    msg,
                ) from e
        return raw_value

    def __post_init__(self) -> None:
        self.ensure_type(self.current_value)

    def update_value(self, new_value: AttributeValueType) -> None:
        object.__setattr__(self, "current_value", self.ensure_type(new_value))
        object.__setattr__(self, "last_updated", datetime.now(UTC))

    @classmethod
    def create(
        cls,
        name: str,
        data_type: DataType,
        read_write_modes: set[ReadWriteMode],
    ) -> "Attribute":
        return cls(
            name=name,
            data_type=data_type,
            read_write_modes=read_write_modes,
            current_value=None,
            last_updated=None,
        )
