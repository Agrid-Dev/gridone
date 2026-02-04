from datetime import UTC, datetime

from pydantic import BaseModel, model_validator

from core.types import AttributeValueType, DataType, ReadWriteMode
from core.utils.cast import cast


class Attribute(BaseModel):
    name: str
    data_type: DataType
    read_write_modes: set[ReadWriteMode]
    current_value: AttributeValueType | None
    last_updated: datetime | None = None
    last_changed: datetime | None = None

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

    @model_validator(mode="after")
    def ensure_type_and_post_init(self) -> "Attribute":
        self.current_value = self.ensure_type(self.current_value)
        return self

    def _update_value(self, new_value: AttributeValueType) -> None:
        """
        Update the attribute value and timestamp.
        This method is private and should only be called from Device._update_attribute
        to ensure that update listeners are properly executed.
        """
        previous_value = self.current_value
        object.__setattr__(self, "current_value", self.ensure_type(new_value))
        object.__setattr__(self, "last_updated", datetime.now(UTC))
        if new_value != previous_value:
            object.__setattr__(self, "last_changed", datetime.now(UTC))

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
