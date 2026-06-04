from collections import deque
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any, Literal

from pydantic import (
    BaseModel,
    PrivateAttr,
    computed_field,
    model_serializer,
    model_validator,
)

from devices_manager.core.utils.cast import cast
from devices_manager.types import AttributeValueType, DataType, ReadWriteMode
from models.types import Severity

from .event_log import AttributeEventLog, AttributeLogs, EventType


class AttributeKind(StrEnum):
    STANDARD = "standard"
    FAULT = "fault"


class Attribute(BaseModel):
    kind: Literal[AttributeKind.STANDARD] = AttributeKind.STANDARD

    name: str
    data_type: DataType
    read_write_modes: set[ReadWriteMode]
    current_value: AttributeValueType | None
    last_updated: datetime | None = None
    last_changed: datetime | None = None
    value_options: list[AttributeValueType] | None = None

    _logs: dict[EventType, deque[AttributeEventLog]] = PrivateAttr(
        default_factory=lambda: {t: deque(maxlen=10) for t in EventType}
    )

    @model_serializer(mode="wrap")
    def _serialize(self, handler: Any) -> dict[str, Any]:  # noqa: ANN401
        data = handler(self)
        if data.get("value_options") is None:
            data.pop("value_options", None)
        return data

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
        if self.current_value is not None:
            self.current_value = self.ensure_type(self.current_value)
        return self

    def update_value(self, new_value: AttributeValueType) -> None:
        """Update the attribute value and timestamp."""
        previous_value = self.current_value
        object.__setattr__(self, "current_value", self.ensure_type(new_value))
        object.__setattr__(self, "last_updated", datetime.now(UTC))
        if self.current_value != previous_value:
            object.__setattr__(self, "last_changed", datetime.now(UTC))

    def append_log(self, entry: AttributeEventLog) -> None:
        self._logs[entry.event_type].appendleft(entry)

    @property
    def logs(self) -> AttributeLogs:
        return AttributeLogs(
            read=list(self._logs[EventType.READ]),
            write=list(self._logs[EventType.WRITE]),
            listen=list(self._logs[EventType.LISTEN]),
        )

    @classmethod
    def create(
        cls,
        name: str,
        data_type: DataType,
        read_write_modes: set[ReadWriteMode],
        value: AttributeValueType | None = None,
        value_options: list[AttributeValueType] | None = None,
    ) -> "Attribute":
        return cls(
            name=name,
            data_type=data_type,
            read_write_modes=read_write_modes,
            current_value=value,
            last_updated=datetime.now(UTC) if value is not None else None,
            value_options=value_options,
        )


class FaultAttribute(Attribute):
    kind: Literal[AttributeKind.FAULT] = AttributeKind.FAULT

    severity: Severity = Severity.WARNING
    healthy_values: list[AttributeValueType]

    @computed_field
    @property
    def is_faulty(self) -> bool:
        if self.current_value is None:
            return False
        return self.current_value not in self.healthy_values

    @model_validator(mode="after")
    def _require_timestamps_when_valued(self) -> "FaultAttribute":
        if self.current_value is not None and (
            self.last_updated is None or self.last_changed is None
        ):
            msg = (
                "FaultAttribute with a current_value must have last_updated "
                "and last_changed set"
            )
            raise ValueError(msg)
        return self
