"""The presentation as a driver stores it: an opaque, bounded JSON document.

Conservation and execution are separate steps (ADR §10): a server keeps a
document whose version or capabilities it does not understand, so a newer
dialect survives a round trip through an older server. Only two fields are
read here — ``schema_version`` and ``requires`` — and only to decide, later,
whether the rest is worth validating (``validation.validate_presentation``).
"""

from __future__ import annotations

import math
from typing import Any

from pydantic import BaseModel, ConfigDict, StrictInt, model_validator

from .capabilities import DOCUMENT_BUDGETS, SUPPORTED_SCHEMA_VERSIONS

type JsonValue = (
    None | bool | int | float | str | list[JsonValue] | dict[str, JsonValue]
)
"""What a stored presentation may contain: JSON scalars, arrays and objects."""

type JsonObject = dict[str, JsonValue]

_SCALAR_TYPES = (bool, int, float, str, type(None))

# The checks below raise ValueError even for wrong types: pydantic only turns
# ValueError into a ValidationError, a TypeError would escape as a crash.


def _check_json_document(root: object) -> None:
    """Reject anything a JSON store could not hold back verbatim.

    Walks the document iteratively (a recursive walk would hit Python's own
    limit before ours on a hostile input) and fails on: non-JSON types, NaN
    or infinite floats, non-string keys, nesting deeper than
    ``max_document_depth``, or more than ``max_document_nodes`` values.
    Every value — scalar or container — counts as one node.
    """
    stack: list[tuple[object, str, int]] = [(root, "", 1)]
    nodes = 0
    while stack:
        value, path, depth = stack.pop()
        nodes += 1
        if nodes > DOCUMENT_BUDGETS.max_document_nodes:
            msg = f"more than {DOCUMENT_BUDGETS.max_document_nodes} nodes"
            raise ValueError(msg)
        if depth > DOCUMENT_BUDGETS.max_document_depth:
            msg = f"nesting deeper than {DOCUMENT_BUDGETS.max_document_depth} at {path}"
            raise ValueError(msg)
        stack.extend(_children(value, path, depth))


def _children(value: object, path: str, depth: int) -> list[tuple[object, str, int]]:
    """The values nested in ``value``, each with its JSON-pointer path and depth."""
    if isinstance(value, dict):
        for key in value:
            if not isinstance(key, str):
                msg = f"non-string key {key!r} at {path or '/'}"
                raise ValueError(msg)  # noqa: TRY004
        return [(child, f"{path}/{key}", depth + 1) for key, child in value.items()]
    if isinstance(value, list):
        return [(child, f"{path}/{i}", depth + 1) for i, child in enumerate(value)]
    _check_scalar(value, path)
    return []


def _check_scalar(value: object, path: str) -> None:
    if not isinstance(value, _SCALAR_TYPES):
        msg = f"unsupported value of type {type(value).__name__} at {path or '/'}"
        raise ValueError(msg)  # noqa: TRY004
    if isinstance(value, float) and not math.isfinite(value):
        msg = f"non-finite number at {path or '/'}"
        raise ValueError(msg)


class PresentationEnvelope(BaseModel):
    """A presentation document as stored on a driver.

    ``schema_version`` and ``requires`` are typed because they decide the
    document's fate; everything else is kept exactly as given (``extra``
    values are never coerced) so that a document this server cannot read
    is neither altered nor lost.
    """

    model_config = ConfigDict(extra="allow")

    schema_version: StrictInt
    requires: list[str]

    @model_validator(mode="before")
    @classmethod
    def _check_document(cls, data: Any) -> Any:  # noqa: ANN401
        if not isinstance(data, dict):
            msg = "presentation must be a JSON object"
            raise ValueError(msg)  # noqa: TRY004
        _check_json_document(data)
        return data

    @property
    def document(self) -> JsonObject:
        """A copy of the whole document, peeked fields included."""
        return self.model_dump()

    @property
    def is_version_supported(self) -> bool:
        return self.schema_version in SUPPORTED_SCHEMA_VERSIONS
