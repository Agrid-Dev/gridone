from pydantic import BaseModel

from .registry.identity_parser import IdentityParser
from .registry.json_path_parser import JsonPathParser
from .registry.json_pointer_parser import JsonPointerParser
from .registry.scale_parser import ScaleParser
from .value_parser import ValueParser

value_parser_builders = {
    "identity": IdentityParser,
    "scale": ScaleParser,
    "json_pointer": JsonPointerParser,
    "json_path": JsonPathParser,
}

supported_value_parsers = list(value_parser_builders.keys())


class ValueParserSchema(BaseModel):
    parser_key: str
    parser_raw: str | float


def build_value_parser(raw_parsers: list[ValueParserSchema]) -> ValueParser:
    parser_key = raw_parsers[0].parser_key  # TODO
    parser_raw = raw_parsers[0].parser_raw
    builder = value_parser_builders.get(parser_key)
    if not builder:
        msg = (
            f"Unknown value parser: {parser_key}."
            f"Available value parsers: {supported_value_parsers}"
        )
        raise ValueError(msg)
    return builder(str(parser_raw))
