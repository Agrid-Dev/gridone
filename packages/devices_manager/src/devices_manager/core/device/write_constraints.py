"""Enforcement of an attribute's declarative write constraints.

Pure functions, so the rules are testable without a device: the device
supplies the value being written and a resolver for sibling attribute values.
"""

from __future__ import annotations

import math
from typing import TYPE_CHECKING

from devices_manager.core.driver.attribute_metadata import AttributeRef
from models.errors import InvalidError

if TYPE_CHECKING:
    from collections.abc import Callable

    from devices_manager.core.driver.attribute_metadata import Bound
    from devices_manager.types import AttributeValueType

    from .attribute import Attribute

STEP_TOLERANCE = 1e-9
"""How far ``value / step`` may sit from an integer and still count as on-grid;
absorbs binary floating-point noise (``0.3 / 0.1`` is ``2.9999999999999996``)."""

type ValueResolver = Callable[[str], AttributeValueType | None]
"""Current value of a sibling attribute by name; ``None`` when unknown."""


def check_write_constraints(
    attribute: Attribute, value: AttributeValueType, resolve: ValueResolver
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
    minimum = _resolve_bound(attribute.name, constraints.minimum, resolve)
    maximum = _resolve_bound(attribute.name, constraints.maximum, resolve)
    step = _resolve_bound(attribute.name, constraints.step, resolve, what="step")
    if step is not None and step <= 0:
        msg = f"step of '{attribute.name}' resolved to {step}; write refused"
        raise InvalidError(msg)
    if minimum is not None and number < minimum:
        msg = f"Value {number} for '{attribute.name}' is below the minimum {minimum}"
        raise InvalidError(msg)
    if maximum is not None and number > maximum:
        msg = f"Value {number} for '{attribute.name}' is above the maximum {maximum}"
        raise InvalidError(msg)
    if step is not None and not _on_step_grid(number, step):
        msg = (
            f"Value {number} for '{attribute.name}' is not a multiple of the step "
            f"{step}"
        )
        raise InvalidError(msg)


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
        raise InvalidError(msg)
    return value


def _resolve_bound(
    attribute_name: str,
    bound: Bound | None,
    resolve: ValueResolver,
    *,
    what: str = "bound",
) -> float | int | None:
    if not isinstance(bound, AttributeRef):
        return bound
    resolved = resolve(bound.attribute)
    if (
        resolved is None
        or isinstance(resolved, bool)
        or not isinstance(resolved, int | float)
        or (isinstance(resolved, float) and not math.isfinite(resolved))
    ):
        msg = (
            f"{what} '{bound.attribute}' of '{attribute_name}' is unknown; "
            "write refused"
        )
        raise InvalidError(msg)
    return resolved


def _on_step_grid(value: float, step: float) -> bool:
    """Whether ``value`` is a whole number of ``step``s away from 0.

    The grid is anchored at 0, not at the minimum: with ``step: 0.5``, 21.5
    (``21.5 / 0.5 = 43``) is accepted and 21.3 (``42.6``) refused, whatever
    the bounds are. ``value / step`` may drift from an integer by up to
    ``STEP_TOLERANCE`` to absorb floating-point noise.
    """
    quotient = value / step
    return math.isfinite(quotient) and abs(quotient - round(quotient)) <= STEP_TOLERANCE
