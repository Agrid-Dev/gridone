"""Pure, bounded three-valued evaluation shared by commands and presentation."""

from __future__ import annotations

import math
from collections.abc import Callable
from dataclasses import dataclass, field

from models.expressions import (
    MAX_ATTRIBUTE_OPERATIONS,
    MAX_EXPRESSION_DEPTH,
    ArithmeticExpression,
    AttributeRef,
    CandidateRef,
    ChoiceExpression,
    Comparison,
    Condition,
    DeviceAttributeRef,
    EventRef,
    Expression,
    IsKnown,
    Junction,
    Membership,
    Negation,
    expression_nodes,
)
from models.types import AttributeValueType

STEP_TOLERANCE = 1e-9

type ValueResolver = Callable[[str], AttributeValueType | None]
type DeviceAttributeResolver = Callable[[DeviceAttributeRef], AttributeValueType | None]


class EvaluationLimitError(ValueError):
    """The driver's evaluation exhausted a server-owned resource budget."""


def scalar_equal(left: object, right: object) -> bool:
    """JSON scalar equality: booleans are distinct from numbers, unlike Python."""
    return left == right and isinstance(left, bool) == isinstance(right, bool)


def scalar_key[T](value: T) -> tuple[bool, T]:
    """Hashable form of `scalar_equal`: two keys match exactly when it holds."""
    return (isinstance(value, bool), value)


def is_number(value: object) -> bool:
    return (
        not isinstance(value, bool)
        and isinstance(value, int | float)
        and (not isinstance(value, float) or math.isfinite(value))
    )


def attribute_references(root: object) -> set[str]:
    return {
        node.attribute
        for _, node, _ in expression_nodes(root)
        if isinstance(node, AttributeRef)
    }


def uses_candidate(root: object) -> bool:
    return any(isinstance(node, CandidateRef) for _, node, _ in expression_nodes(root))


@dataclass
class EvaluationBudget:
    remaining: int = MAX_ATTRIBUTE_OPERATIONS
    parent: EvaluationBudget | None = None

    def spend(self) -> None:
        self.remaining -= 1
        if self.remaining < 0:
            msg = "Evaluation budget exceeded"
            raise EvaluationLimitError(msg)
        if self.parent is not None:
            self.parent.spend()


@dataclass
class EvaluationContext:
    """One call's immutable input resolver and consumable operation budget."""

    resolve: ValueResolver
    candidate: AttributeValueType | None = None
    budget: EvaluationBudget = field(default_factory=EvaluationBudget)
    missing: set[str] = field(default_factory=set)
    resolve_attribute: DeviceAttributeResolver | None = None
    resolve_event: ValueResolver | None = None

    def spend(self, depth: int) -> None:
        self.budget.spend()
        if depth > MAX_EXPRESSION_DEPTH:
            msg = "Expression depth exceeded"
            raise EvaluationLimitError(msg)

    def value(  # noqa: PLR0911 -- expression AST dispatch
        self, expression: Expression, depth: int = 0
    ) -> AttributeValueType | None:
        """Evaluate only the selected branch; unknown tests never choose a default."""
        self.spend(depth)
        if isinstance(expression, EventRef):
            return self.resolve_event(expression.event) if self.resolve_event else None
        if isinstance(expression, DeviceAttributeRef):
            result = (
                self.resolve_attribute(expression) if self.resolve_attribute else None
            )
            if result is None:
                self.missing.add(f"{expression.device_id}/{expression.attribute}")
            return result
        if isinstance(expression, AttributeRef):
            result = self.resolve(expression.attribute)
            if result is None:
                self.missing.add(expression.attribute)
            return result
        if isinstance(expression, CandidateRef):
            return self.candidate
        if isinstance(expression, ChoiceExpression):
            selected = self.condition(expression.condition, depth + 1)
            if selected is None:
                return None
            return self.value(
                expression.then if selected else expression.otherwise, depth + 1
            )
        if isinstance(expression, ArithmeticExpression):
            return self._arithmetic(expression, depth)
        return expression

    def _arithmetic(
        self, expression: ArithmeticExpression, depth: int
    ) -> int | float | None:
        numbers: list[int | float] = []
        for argument in expression.args:
            value = self.value(argument, depth + 1)
            if (
                isinstance(value, bool)
                or not isinstance(value, int | float)
                or not is_number(value)
            ):
                return None
            numbers.append(value)
        try:
            return self._calculate(expression.op, numbers)
        except (OverflowError, ValueError):
            return None

    @staticmethod
    def _calculate(op: str, numbers: list[int | float]) -> int | float | None:
        result: int | float
        match op:
            case "add":
                result = sum(numbers)
            case "subtract":
                result = numbers[0] - sum(numbers[1:])
            case "min":
                result = min(numbers)
            case "max":
                result = max(numbers)
            case _:
                return None
        return result if is_number(result) else None

    def condition(self, condition: Condition, depth: int = 0) -> bool | None:  # noqa: PLR0911 -- AST dispatch
        """Kleene logic: false AND unknown is false; true OR unknown is true."""
        self.spend(depth)
        if isinstance(condition, IsKnown):
            return self.value(condition.value, depth + 1) is not None
        if isinstance(condition, Comparison):
            return self._compare(condition, depth)
        if isinstance(condition, Membership):
            value = self.value(condition.value, depth + 1)
            if value is None:
                return None
            for option in condition.values:
                self.spend(depth)
                if scalar_equal(value, option):
                    return True
            return False
        if isinstance(condition, Negation):
            value = self.condition(condition.condition, depth + 1)
            return None if value is None else not value
        return self._junction(condition, depth)

    def _junction(self, condition: Junction, depth: int) -> bool | None:
        unknown = False
        decisive = condition.op == "any"
        for child in condition.conditions:
            value = self.condition(child, depth + 1)
            if value is decisive:
                return decisive
            unknown |= value is None
        return None if unknown else not decisive

    def _compare(self, condition: Comparison, depth: int) -> bool | None:  # noqa: PLR0911 -- operator dispatch
        left = self.value(condition.left, depth + 1)
        right = self.value(condition.right, depth + 1)
        if left is None or right is None:
            return None
        if condition.op == "eq":
            return scalar_equal(left, right)
        if (
            isinstance(left, bool)
            or not isinstance(left, int | float)
            or isinstance(right, bool)
            or not isinstance(right, int | float)
            or not is_number(left)
            or not is_number(right)
        ):
            return None
        match condition.op:
            case "lt":
                return left < right
            case "lte":
                return left <= right
            case "gt":
                return left > right
            case "gte":
                return left >= right


def on_step_grid(value: float, step: float) -> bool:
    """Whether ``value`` is a whole number of ``step``s away from 0.

    The grid is anchored at 0, not at the minimum: with ``step: 0.5``, 21.5
    (``21.5 / 0.5 = 43``) is accepted and 21.3 (``42.6``) refused, whatever
    the bounds are. ``value / step`` may drift from an integer by up to
    ``1e-9`` to absorb floating-point noise.
    """
    try:
        quotient = value / step
    except OverflowError:
        return False
    return math.isfinite(quotient) and abs(quotient - round(quotient)) <= STEP_TOLERANCE
