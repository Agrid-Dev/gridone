"""Bounded declarative expressions over observed device attributes.

References deliberately retain the existing ``{attribute: name}`` spelling.
Drivers accept only local references; site rules may use explicit device attributes.
There are no executable strings, paths or named helpers.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Annotated, Literal

if TYPE_CHECKING:
    from collections.abc import Iterator

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StrictBool,
    StrictFloat,
    StrictInt,
    StrictStr,
)

MAX_EXPRESSION_DEPTH = 16
MAX_RULES = 64
MAX_LIST_ITEMS = 256
MAX_ATTRIBUTE_OPERATIONS = 10_000
MAX_DEVICE_OPERATIONS = 100_000

Scalar = (
    StrictBool
    | StrictInt
    | Annotated[StrictFloat, Field(allow_inf_nan=False)]
    | StrictStr
)
Number = StrictInt | Annotated[StrictFloat, Field(allow_inf_nan=False)]


class ExpressionModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class AttributeRef(ExpressionModel):
    """Current observed value of a sibling attribute, e.g. ``{attribute: limit}``."""

    attribute: Annotated[str, Field(min_length=1)]


class CandidateRef(ExpressionModel):
    """The typed proposed value, without changing the observed device state."""

    candidate: Literal[True]


class DeviceAttributeRef(ExpressionModel):
    """An observed attribute, e.g. ``{device_id: pump, attribute: running}``."""

    device_id: Annotated[str, Field(min_length=1)]
    attribute: Annotated[str, Field(min_length=1)]


class EventRef(ExpressionModel):
    """An automation event value; unavailable in driver and write-rule contexts."""

    event: Literal[
        "device_id",
        "attribute",
        "previous_value",
        "value",
        "has_previous",
        "is_initial",
    ]


class ArithmeticExpression(ExpressionModel):
    op: Literal["add", "subtract", "min", "max"]
    args: Annotated[list[Expression], Field(min_length=2, max_length=MAX_LIST_ITEMS)]


class ChoiceExpression(ExpressionModel):
    op: Literal["if"]
    condition: Condition
    then: Expression
    otherwise: Expression


type Expression = (
    Scalar
    | AttributeRef
    | DeviceAttributeRef
    | EventRef
    | CandidateRef
    | ArithmeticExpression
    | ChoiceExpression
)


class Comparison(ExpressionModel):
    op: Literal["eq", "lt", "lte", "gt", "gte"]
    left: Expression
    right: Expression


class Membership(ExpressionModel):
    op: Literal["in"]
    value: Expression
    values: Annotated[list[Scalar], Field(max_length=MAX_LIST_ITEMS)]


class IsKnown(ExpressionModel):
    op: Literal["is_known"]
    value: Expression


class Negation(ExpressionModel):
    op: Literal["not"]
    condition: Condition


class Junction(ExpressionModel):
    op: Literal["all", "any"]
    conditions: Annotated[list[Condition], Field(max_length=MAX_LIST_ITEMS)]


type Condition = Annotated[
    Comparison | Membership | IsKnown | Negation | Junction, Field(discriminator="op")
]


for _model in (
    ArithmeticExpression,
    ChoiceExpression,
    Comparison,
    Membership,
    IsKnown,
    Negation,
    Junction,
):
    _model.model_rebuild()


def expression_nodes(root: object) -> Iterator[tuple[str, object, int]]:
    """Visit typed fields iteratively, preserving authoring diagnostic paths."""
    pending = [("", root, 0)]
    while pending:
        path, value, depth = pending.pop()
        yield path, value, depth
        if isinstance(value, BaseModel):
            pending.extend(
                (f"{path}.{key}", getattr(value, key), depth + 1)
                for key in type(value).model_fields
            )
        elif isinstance(value, list):
            pending.extend(
                (f"{path}[{i}]", item, depth) for i, item in enumerate(value)
            )


def rename_references(root: object, old: str, new: str) -> object:
    """Copy typed rule fields, changing only explicit attribute-reference nodes."""
    if isinstance(root, AttributeRef):
        return AttributeRef(attribute=new) if root.attribute == old else root
    if isinstance(root, BaseModel):
        return root.model_copy(
            update={
                key: rename_references(getattr(root, key), old, new)
                for key in type(root).model_fields
            }
        )
    if isinstance(root, list):
        return [rename_references(item, old, new) for item in root]
    return root
