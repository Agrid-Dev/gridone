from pydantic import BaseModel

from core.types import DataType
from core.utils.templating.render import render_struct
from core.value_parsers import ValueParser, value_parser_factory


class AttributeSchema(BaseModel):
    attribute_name: str  # core side - the target attribute name
    data_type: DataType
    address: str | dict  # protocol side - the address used in the protocol
    value_parser: ValueParser

    @classmethod
    def from_dict(cls, data: dict[str, str]) -> "AttributeSchema":
        # Destructure known fields
        attribute_name = data["name"]
        data_type = data["data_type"]
        address = data["address"]
        # Collect the rest as parser arguments
        parsers = {
            k: v for k, v in data.items() if k not in ("name", "data_type", "address")
        }
        value_parser = value_parser_factory(**parsers)
        return cls(
            attribute_name=attribute_name,
            data_type=DataType(data_type),
            address=address,
            value_parser=value_parser,
        )

    def render(self, context: dict) -> "AttributeSchema":
        rendered_address = render_struct(
            self.address,
            context,
            raise_for_missing_context=True,
        )
        return self.model_copy(update={"address": rendered_address})
