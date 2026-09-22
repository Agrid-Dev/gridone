"""Import-time validation and reference maintenance for write declarations."""

from __future__ import annotations

from typing import TYPE_CHECKING

from models.conditions import attribute_references, scalar_equal
from models.errors import InvalidError
from models.expression_validation import validate_expression
from models.expressions import (
    MAX_ATTRIBUTE_OPERATIONS,
    MAX_DEVICE_OPERATIONS,
    AttributeRef,
    DeviceAttributeRef,
    expression_nodes,
    rename_references,
)
from models.types import DataType

if TYPE_CHECKING:
    from collections.abc import Iterable

    from .attribute_driver import AttributeDriver

WRITE_FIELDS = ("write_constraints", "write_rules", "write_options", "value_mapping")
_TYPE_NAMES = {
    DataType.INT: "number",
    DataType.FLOAT: "number",
    DataType.BOOL: "bool",
    DataType.STRING: "str",
}


def write_references(attribute: AttributeDriver) -> set[str]:
    return set().union(
        *(attribute_references(getattr(attribute, key)) for key in WRITE_FIELDS)
    )


def rename_write_references(
    attribute: AttributeDriver, old: str, new: str
) -> AttributeDriver:
    return attribute.model_copy(
        update={
            key: rename_references(getattr(attribute, key), old, new)
            for key in WRITE_FIELDS
        }
    )


def _invalid(path: str, message: str) -> None:
    diagnostic = f"{path}: {message}"
    raise InvalidError(diagnostic)


def validate_write_declarations(attributes: Iterable[AttributeDriver]) -> None:
    """Validate scalar references; only value-computation edges form a DAG.

    Reciprocal guards (low <= high and high >= low) read observations and
    are legal. Mappings that require one another to decode are rejected.
    """
    by_name = {attribute.name: attribute for attribute in attributes}
    types: dict[str | DeviceAttributeRef, str] = {
        name: _TYPE_NAMES[a.data_type] for name, a in by_name.items()
    }
    graph: dict[str, set[str]] = {}
    operations = 0
    for name, attribute in by_name.items():
        cost = sum(
            sum(1 for _ in expression_nodes(getattr(attribute, key)))
            for key in WRITE_FIELDS
        )
        operations += cost
        if cost > MAX_ATTRIBUTE_OPERATIONS or operations > MAX_DEVICE_OPERATIONS:
            _invalid(name, "declaration operation budget exceeded")
        _validate_attribute(attribute, types)
        graph[name] = attribute_references(attribute.value_mapping)
    remaining = dict(graph)
    while remaining:
        leaves = {
            name
            for name, dependencies in remaining.items()
            if not dependencies & remaining.keys()
        }
        if not leaves:
            _invalid(
                "value_mapping",
                f"calculation cycle involving {', '.join(sorted(remaining))}",
            )
        for name in leaves:
            del remaining[name]


def _validate_attribute(
    attribute: AttributeDriver, types: dict[str | DeviceAttributeRef, str]
) -> None:
    _validate_constraints(attribute, types)
    for i, rule in enumerate(attribute.write_rules):
        validate_expression(
            rule.condition,
            types,
            types[attribute.name],
            f"{attribute.name}.write_rules[{i}]",
        )
    _validate_options(attribute, types)
    _validate_default(attribute, types)
    if attribute.value_mapping:
        for i, entry in enumerate(attribute.value_mapping.entries):
            _validate_value(
                attribute, entry.value, types, f"value_mapping.entries[{i}]"
            )
        if attribute.value_mapping.stop_value is not None:
            _validate_value(
                attribute,
                attribute.value_mapping.stop_value,
                types,
                "value_mapping.stop_value",
            )


def _validate_value(
    attribute: AttributeDriver,
    value: object,
    types: dict[str | DeviceAttributeRef, str],
    path: str,
) -> None:
    full_path = f"{attribute.name}.{path}"
    if validate_expression(value, types, None, full_path) != types[attribute.name]:
        _invalid(full_path, "value has an incompatible type")
    if (
        attribute.data_type == DataType.INT
        and isinstance(value, float)
        and not value.is_integer()
    ):
        _invalid(full_path, "expected an integer")


def _validate_constraints(
    attribute: AttributeDriver, types: dict[str | DeviceAttributeRef, str]
) -> None:
    constraints = attribute.write_constraints
    if constraints is None:
        return
    if types[attribute.name] != "number":
        msg = (
            f"Attribute '{attribute.name}' declares write_constraints but its "
            f"data_type '{attribute.data_type}' is not numeric (int or float)"
        )
        raise InvalidError(msg)
    for key in ("minimum", "maximum", "step"):
        value = getattr(constraints, key)
        if value is None:
            continue
        path = f"Attribute '{attribute.name}' write_constraints.{key}"
        if isinstance(value, AttributeRef):
            _validate_bound_ref(attribute.name, path, value, types)
        if validate_expression(value, types, None, path) != "number":
            _invalid(path, "expected a numeric expression")


def _validate_bound_ref(
    name: str, path: str, ref: AttributeRef, types: dict[str | DeviceAttributeRef, str]
) -> None:
    if ref.attribute == name:
        msg = f"{path} must not reference the attribute itself"
        raise InvalidError(msg)
    target = types.get(ref.attribute)
    if target is None:
        msg = f"{path} references unknown attribute '{ref.attribute}'"
        raise InvalidError(msg)
    if target != "number":
        msg = (
            f"{path} references attribute '{ref.attribute}' whose data_type "
            f"'{target}' is not numeric (int or float)"
        )
        raise InvalidError(msg)


def _validate_options(
    attribute: AttributeDriver, types: dict[str | DeviceAttributeRef, str]
) -> None:
    for i, option in enumerate(attribute.write_options or []):
        _validate_value(attribute, option.value, types, f"write_options[{i}].value")
        if any(
            scalar_equal(option.value, other.value)
            for other in (attribute.write_options or [])[:i]
        ):
            _invalid(attribute.name, "duplicate write option")
        if option.allowed_when:
            validate_expression(
                option.allowed_when,
                types,
                types[attribute.name],
                f"{attribute.name}.write_options[{i}].allowed_when",
            )


def _validate_default(
    attribute: AttributeDriver, types: dict[str | DeviceAttributeRef, str]
) -> None:
    value = attribute.default_value
    if value is None:
        return
    _validate_value(attribute, value, types, "default_value")
    options = (
        [option.value for option in attribute.write_options]
        if attribute.write_options is not None
        else None
        if attribute.value_mapping
        else attribute.value_options
    )
    if options is not None and not any(
        scalar_equal(value, option) for option in options
    ):
        _invalid(attribute.name, "default_value is absent from write options")
    constraints = attribute.write_constraints
    if constraints is None or any(
        scalar_equal(value, sentinel) for sentinel in constraints.sentinels
    ):
        return
    if not isinstance(value, int | float):
        return
    if isinstance(constraints.minimum, int | float) and value < constraints.minimum:
        _invalid(attribute.name, "default_value is below minimum")
    if isinstance(constraints.maximum, int | float) and value > constraints.maximum:
        _invalid(attribute.name, "default_value is above maximum")
    if isinstance(constraints.step, int | float):
        from models.conditions import on_step_grid  # noqa: PLC0415

        if not on_step_grid(value, constraints.step):
            _invalid(attribute.name, "default_value is not on the step grid")
