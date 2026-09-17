"""Enforcement of an attribute's declarative write constraints.

Pure functions, so the rules are testable without a device: the device
supplies the value being written and a resolver for sibling attribute values.
"""

from __future__ import annotations

import math
from typing import TYPE_CHECKING

from devices_manager.core.conditions import (
    EvaluationContext,
    EvaluationLimitError,
    on_step_grid,
    scalar_equal,
)
from models.errors import InvalidError, WriteRejectedError
from models.expressions import AttributeRef
from models.write_rules import ResolvedConstraints, WriteReason

if TYPE_CHECKING:
    from collections.abc import Callable

    from devices_manager.core.driver.attribute_driver import AttributeDriver
    from devices_manager.types import AttributeValueType
    from models.attribute_metadata import Bound

    from .attribute import Attribute

STEP_TOLERANCE = 1e-9
"""How far ``value / step`` may sit from an integer and still count as on-grid;
absorbs binary floating-point noise (``0.3 / 0.1`` is ``2.9999999999999996``)."""

type ValueResolver = Callable[[str], AttributeValueType | None]
"""Current value of a sibling attribute by name; ``None`` when unknown."""


def preview_write_constraints(
    attribute: Attribute | AttributeDriver,
    resolve: ValueResolver,
    *,
    context: EvaluationContext | None = None,
) -> ResolvedConstraints | None:
    """Expose known limits and unresolved fields without revealing internal errors."""
    if attribute.write_constraints is None:
        return None
    result = ResolvedConstraints(sentinels=attribute.write_constraints.sentinels)
    for name in ("minimum", "maximum", "step"):
        try:
            value = _resolve_bound(
                attribute.name,
                getattr(attribute.write_constraints, name),
                resolve,
                context=context,
            )
        except InvalidError:
            result.unknown.append(name)
        else:
            if name == "step" and value is not None and value <= 0:
                result.unknown.append(name)
            else:
                setattr(result, name, value)
    return result


def check_write_constraints(
    attribute: Attribute | AttributeDriver,
    value: AttributeValueType,
    resolve: ValueResolver,
    *,
    context: EvaluationContext | None = None,
) -> None:
    """Refuse ``value`` when it violates ``attribute.write_constraints``.

    A step or bound given as ``{attribute: name}`` is resolved through
    ``resolve`` to that attribute's current value; an unknown one (attribute
    missing, or no value yet) refuses the write rather than skipping the
    check, and so does a resolved step that is not positive.

    Raises ``InvalidError`` for a violated constraint or an unknown reference.
    """
    constraints = attribute.write_constraints
    if constraints is None:
        return
    number = _as_number(attribute.name, value)
    if any(scalar_equal(number, sentinel) for sentinel in constraints.sentinels):
        return
    minimum = _resolve_bound(
        attribute.name, constraints.minimum, resolve, context=context
    )
    maximum = _resolve_bound(
        attribute.name, constraints.maximum, resolve, context=context
    )
    step = _resolve_bound(
        attribute.name, constraints.step, resolve, what="step", context=context
    )
    if step is not None and step <= 0:
        msg = f"step of '{attribute.name}' resolved to {step}; write refused"
        raise WriteRejectedError([WriteReason(code="constraints")], msg)
    if minimum is not None and number < minimum:
        msg = f"Value {number} for '{attribute.name}' is below the minimum {minimum}"
        raise WriteRejectedError([WriteReason(code="constraints")], msg)
    if maximum is not None and number > maximum:
        msg = f"Value {number} for '{attribute.name}' is above the maximum {maximum}"
        raise WriteRejectedError([WriteReason(code="constraints")], msg)
    if step is not None and not on_step_grid(number, step):
        msg = (
            f"Value {number} for '{attribute.name}' is not a multiple of the step "
            f"{step}"
        )
        raise WriteRejectedError([WriteReason(code="constraints")], msg)


def _as_number(attribute_name: str, value: AttributeValueType) -> float | int:
    """Constraints only exist on int/float attributes and ``ensure_type`` casts
    before the check runs, so anything else here is a programming error."""
    if isinstance(value, bool) or not isinstance(value, int | float):
        msg = (
            f"Write constraints of '{attribute_name}' apply to numeric values, "
            f"got {type(value).__name__}"
        )
        raise TypeError(msg)
    if isinstance(value, float) and not math.isfinite(value):
        msg = f"Value for '{attribute_name}' must be finite; write refused"
        raise WriteRejectedError([WriteReason(code="constraints")], msg)
    return value


def _resolve_bound(
    attribute_name: str,
    bound: Bound | None,
    resolve: ValueResolver,
    *,
    what: str = "bound",
    context: EvaluationContext | None = None,
) -> float | int | None:
    if bound is None:
        return None
    try:
        resolved = (context or EvaluationContext(resolve)).value(bound)
    except EvaluationLimitError as exc:
        raise WriteRejectedError([WriteReason(code="evaluation_limit")]) from exc
    if (
        resolved is None
        or isinstance(resolved, bool)
        or not isinstance(resolved, int | float)
        or (isinstance(resolved, float) and not math.isfinite(resolved))
    ):
        label = f" '{bound.attribute}'" if isinstance(bound, AttributeRef) else ""
        msg = f"{what}{label} of '{attribute_name}' is unknown; write refused"
        raise WriteRejectedError([WriteReason(code="unknown_dependencies")], msg)
    return resolved
