from collections.abc import Callable

from jsonpath import pointer

from core.types import AttributeValueType

type InputDict = dict[str, str]

type ValueParser = Callable[[InputDict], AttributeValueType]


def json_path_parser(data: dict, json_path: str) -> AttributeValueType:
    """
    Retrieve a value from a dict context using a JSON path.
    The context dict may contain JSON-encoded strings as values.
    """
    return pointer.resolve(json_path, data)


def value_parser_factory(*, json_path: str | None = None) -> ValueParser:
    if json_path is not None:
        return lambda result: json_path_parser(result, json_path)
    msg = "At least one parser parameter must be provided"
    raise ValueError(msg)
