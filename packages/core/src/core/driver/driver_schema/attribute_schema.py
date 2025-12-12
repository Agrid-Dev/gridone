from typing import Any

from pydantic import BaseModel, model_validator

from core.transports import RawTransportAddress
from core.types import DataType
from core.utils.templating.render import render_struct
from core.value_parsers.factory import ValueParserSchema, supported_value_parsers

DEFAULT_VALUE_PARSER_SCHEMA = ValueParserSchema(parser_key="identity", parser_raw="")


def get_value_parser_schemas(attribute_schema_dict: dict) -> list[ValueParserSchema]:
    parsers = [
        ValueParserSchema(parser_key=key, parser_raw=attribute_schema_dict[key])
        for key in supported_value_parsers
        if key in attribute_schema_dict
    ]
    return parsers if parsers else [DEFAULT_VALUE_PARSER_SCHEMA]


class AttributeSchema(BaseModel):
    name: str  # core side - the target attribute name
    data_type: DataType
    read: RawTransportAddress
    write: RawTransportAddress | None = None
    value_parser: list[ValueParserSchema]

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
        value_parser = get_value_parser_schemas(data)
        return cls(**{**data, "value_parser": value_parser})

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
