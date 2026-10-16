from datetime import UTC, datetime
from typing import Annotated, Any, Literal

from pydantic import (
    BaseModel,
    Discriminator,
    GetJsonSchemaHandler,
    Tag,
    computed_field,
    model_validator,
)
from pydantic.json_schema import JsonSchemaValue
from pydantic_core import CoreSchema

from devices_manager.core.utils.cast import cast
from devices_manager.types import (
    AttributeKind,
    AttributeValueType,
    DataType,
    ReadWriteMode,
)
from models.attribute_metadata import (
    AttributeGroup,
    LocalizedText,
    Unit,
    ValueLabels,
    WriteConstraints,
)
from models.expressions import Scalar
from models.types import Severity
from models.write_rules import AttributeWriteState, WriteReason


class Attribute(BaseModel):
    """Every optional field defaults to None, and the API omits unset fields
    from its payloads: an attribute carries what it has, nothing else."""

    kind: Literal[AttributeKind.STANDARD, AttributeKind.INTERNAL] = (
        AttributeKind.STANDARD
    )

    name: str
    data_type: DataType
    read_write_modes: set[ReadWriteMode]
    current_value: AttributeValueType | None = None
    last_updated: datetime | None = None
    last_changed: datetime | None = None
    value_options: list[AttributeValueType] | None = None
    # Write-time metadata and write constraints, copied from the driver. What
    # to call the attribute is the driver's labels document (ADR 0008), not
    # the device's.
    user_confirmation: LocalizedText | None = None
    group: AttributeGroup | None = None
    unit: Unit | None = None
    value_labels: ValueLabels | None = None
    write_constraints: WriteConstraints | None = None
    default_value: Scalar | None = None
    write_state: AttributeWriteState | None = None
    raw_value: Scalar | None = None
    resolution_error: WriteReason | None = None

    @classmethod
    def __get_pydantic_json_schema__(
        cls, core_schema: CoreSchema, handler: GetJsonSchemaHandler
    ) -> JsonSchemaValue:
        # On the wire an attribute stays an open object, as the serialiser this
        # model used to carry declared it; typing it in the SDK is its own change.
        return {"type": "object", "additionalProperties": True}

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

    @classmethod
    def create(  # noqa: PLR0913
        cls,
        name: str,
        data_type: DataType,
        read_write_modes: set[ReadWriteMode],
        value: AttributeValueType | None = None,
        value_options: list[AttributeValueType] | None = None,
        *,
        group: AttributeGroup | None = None,
        unit: Unit | None = None,
        write_constraints: WriteConstraints | None = None,
    ) -> "Attribute":
        now = datetime.now(UTC) if value is not None else None
        return cls(
            name=name,
            data_type=data_type,
            read_write_modes=read_write_modes,
            current_value=value,
            last_updated=now,
            last_changed=now,
            value_options=value_options,
            group=group,
            unit=unit,
            write_constraints=write_constraints,
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


def _attribute_kind_tag(v: Any) -> str:  # noqa: ANN401
    """Resolve the `kind` tag for discriminated-union dispatch.

    Defaults to `standard` when the field is absent — matches the default
    on `Attribute.kind` so payloads without an explicit `kind:` key parse
    as standard attributes.
    """
    if isinstance(v, dict):
        return v.get("kind", AttributeKind.STANDARD)
    return getattr(v, "kind", AttributeKind.STANDARD)


AnyAttribute = Annotated[
    Annotated[Attribute, Tag(AttributeKind.STANDARD)]
    | Annotated[FaultAttribute, Tag(AttributeKind.FAULT)]
    | Annotated[Attribute, Tag(AttributeKind.INTERNAL)],
    Discriminator(_attribute_kind_tag),
]
