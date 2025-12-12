from typing import Any

from pydantic import BaseModel, model_validator

from core.transports import RawTransportAddress
from core.types import DataType
from core.utils.templating.render import render_struct
from core.value_adapters.factory import ValueAdapterSpec, supported_value_adapters

DEFAULT_ADA = ValueAdapterSpec(adapter="identity", argument="")


def get_value_adapter_specs(attribute_schema_dict: dict) -> list[ValueAdapterSpec]:
    return [
        ValueAdapterSpec(adapter=key, argument=attribute_schema_dict[key])
        for key in supported_value_adapters
        if key in attribute_schema_dict
    ]


class AttributeSchema(BaseModel):
    name: str  # core side - the target attribute name
    data_type: DataType
    read: RawTransportAddress
    write: RawTransportAddress | None = None
    value_adapter: list[ValueAdapterSpec]

    @model_validator(mode="before")
    @classmethod
    def use_read_write_as_fallback(cls, data: Any):  # noqa: ANN206, ANN401
        if not isinstance(data, dict):
            return data
        rw = data.get("read_write")
        if rw is not None:
            # Only fill if not already provided
            data.setdefault("read", rw)
            data.setdefault("write", rw)

        return data

    @classmethod
    def from_dict(cls, data: dict[str, str]) -> "AttributeSchema":
        return cls(**{**data, "value_adapter": get_value_adapter_specs(data)})  # ty:ignore[invalid-argument-type]

    def render(
        self,
        context: dict,
    ) -> "AttributeSchema":
        rendered_read_address = render_struct(
            self.read,
            context,
            raise_for_missing_context=True,
        )
        rendered_write_address = self.write
        if self.write is not None:
            rendered_write_address = render_struct(
                self.write,
                context,
                raise_for_missing_context=False,
            )
        return self.model_copy(
            update={
                "read": rendered_read_address,
                "write": rendered_write_address,
            },
        )
