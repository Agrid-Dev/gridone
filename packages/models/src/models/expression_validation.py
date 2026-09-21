"""Shared type validation for the bounded declarative expression language."""

from __future__ import annotations

from models.errors import InvalidError
from models.expressions import (
    MAX_EXPRESSION_DEPTH,
    ArithmeticExpression,
    AttributeRef,
    CandidateRef,
    ChoiceExpression,
    Comparison,
    DevicePointRef,
    IsKnown,
    Junction,
    Membership,
    Negation,
    expression_nodes,
)


def _invalid(path: str, message: str) -> None:
    diagnostic = f"{path}: {message}"
    raise InvalidError(diagnostic)


def validate_expression(
    root: object,
    types: dict[str | DevicePointRef, str],
    candidate_type: str | None,
    path: str,
) -> str:
    """Infer scalar types and reject ill-typed conditions before runtime evaluation."""
    nodes = list(expression_nodes(root))
    if any(depth > MAX_EXPRESSION_DEPTH for _, _, depth in nodes):
        _invalid(path, "expression depth budget exceeded")
    return _infer(root, types, candidate_type, path)


def _infer(  # noqa: PLR0911 -- expression AST dispatch
    root: object,
    types: dict[str | DevicePointRef, str],
    candidate_type: str | None,
    path: str,
) -> str:
    if isinstance(root, bool):
        return "bool"
    if isinstance(root, int | float):
        return "number"
    if isinstance(root, str):
        return "str"
    if isinstance(root, DevicePointRef):
        if root not in types:
            _invalid(path, "external_device_reference")
        return types[root]
    if isinstance(root, AttributeRef):
        if root.attribute not in types:
            _invalid(path, f"unknown attribute '{root.attribute}'")
        return types[root.attribute]
    if isinstance(root, CandidateRef):
        if candidate_type is None:
            _invalid(path, "candidate is not allowed in this expression")
        return candidate_type or "unknown"
    return _infer_composite(root, types, candidate_type, path)


def _infer_composite(
    root: object,
    types: dict[str | DevicePointRef, str],
    candidate_type: str | None,
    path: str,
) -> str:
    if isinstance(root, ArithmeticExpression):
        for i, value in enumerate(root.args):
            if _infer(value, types, candidate_type, f"{path}.args[{i}]") != "number":
                _invalid(path, "arithmetic requires numbers")
        return "number"
    if isinstance(root, ChoiceExpression):
        _infer(root.condition, types, candidate_type, f"{path}.condition")
        left = _infer(root.then, types, candidate_type, f"{path}.then")
        right = _infer(root.otherwise, types, candidate_type, f"{path}.otherwise")
        if left != right:
            _invalid(path, "conditional branches must have the same type")
        return left
    return _infer_condition(root, types, candidate_type, path)


def _infer_condition(
    root: object,
    types: dict[str | DevicePointRef, str],
    candidate_type: str | None,
    path: str,
) -> str:
    if isinstance(root, Comparison):
        left = _infer(root.left, types, candidate_type, f"{path}.left")
        right = _infer(root.right, types, candidate_type, f"{path}.right")
        if left != right or (root.op != "eq" and left != "number"):
            _invalid(path, "incompatible comparison operands")
    elif isinstance(root, Membership):
        value_type = _infer(root.value, types, candidate_type, f"{path}.value")
        for value in root.values:
            if _infer(value, types, candidate_type, path) != value_type:
                _invalid(path, "membership options must have the operand's type")
    elif isinstance(root, IsKnown):
        _infer(root.value, types, candidate_type, f"{path}.value")
    elif isinstance(root, Negation):
        _infer(root.condition, types, candidate_type, f"{path}.condition")
    elif isinstance(root, Junction):
        for i, condition in enumerate(root.conditions):
            _infer(condition, types, candidate_type, f"{path}.conditions[{i}]")
    else:
        _invalid(path, "unsupported expression")
    return "bool"
