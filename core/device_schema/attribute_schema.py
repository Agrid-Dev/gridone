from pydantic import BaseModel

from core.types import DataType
from core.utils.templating.render import render_struct
from core.value_parsers.factory import supported_value_parsers


class ValueParserSchema(BaseModel):
    parser_key: str
    parser_raw: str | float


class AttributeSchema(BaseModel):
    attribute_name: str  # core side - the target attribute name
    data_type: DataType
    address: str | dict  # protocol side - the address used in the protocol
    write_address: str | dict | None = None
    value_parser: ValueParserSchema | None = None

    @classmethod
    def from_dict(cls, data: dict[str, str]) -> "AttributeSchema":
        # Destructure known fields
        attribute_name = data["name"]
        data_type = data["data_type"]
        address = data["address"]
        write_address = data.get("write_address")
        # Collect the rest as parser arguments
        value_parsers = [
            ValueParserSchema(parser_key=key, parser_raw=data[key])
            for key in supported_value_parsers
            if key in data
        ]

        return cls(
            attribute_name=attribute_name,
            data_type=DataType(data_type),
            address=address,
            write_address=write_address,
            value_parser=value_parsers[0] if len(value_parsers) > 0 else None,
        )

    def render(
        self,
        context: dict,
    ) -> "AttributeSchema":
        rendered_address = render_struct(
            self.address,
            context,
            raise_for_missing_context=True,
        )
        rendered_write_address = self.write_address
        if self.write_address is not None:
            rendered_write_address = render_struct(
                self.write_address,
                context,
                raise_for_missing_context=False,
            )
        return self.model_copy(
            update={
                "address": rendered_address,
                "write_address": rendered_write_address,
            },
        )
