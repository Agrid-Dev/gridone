from itertools import product

import pytest
from pydantic import TypeAdapter, ValidationError

from devices_manager.core.conditions import (
    EvaluationBudget,
    EvaluationContext,
    EvaluationLimitError,
)
from models.expressions import Condition, Expression

CONDITION = TypeAdapter(Condition)
EXPRESSION = TypeAdapter(Expression)


def predicate(name):
    return {"op": "eq", "left": {"attribute": name}, "right": True}


@pytest.mark.parametrize(("left", "right"), product([True, False, None], repeat=2))
@pytest.mark.parametrize("op", ["all", "any"])
def test_three_valued_logic(left, right, op):
    context = EvaluationContext({"a": left, "b": right}.get)
    condition = CONDITION.validate_python(
        {"op": op, "conditions": [predicate("a"), predicate("b")]}
    )
    decisive = op == "any"
    expected = (
        decisive
        if decisive in (left, right)
        else None
        if None in (left, right)
        else not decisive
    )
    assert context.condition(condition) is expected


@pytest.mark.parametrize(
    ("left", "right", "expected"),
    [(True, 1, False), (False, 0, False), (1, 1.0, True), ("1", 1, False)],
)
def test_scalar_comparison_never_confuses_bool_number_string(left, right, expected):
    assert (
        EvaluationContext({}.get).condition(
            CONDITION.validate_python({"op": "eq", "left": left, "right": right})
        )
        is expected
    )


@pytest.mark.parametrize(
    ("op", "expected"), [("add", 10), ("subtract", 4), ("min", 3), ("max", 7)]
)
def test_arithmetic(op, expected):
    expression = EXPRESSION.validate_python(
        {"op": op, "args": [{"candidate": True}, {"attribute": "delta"}]}
    )
    assert (
        EvaluationContext({"delta": 3}.get, candidate=7).value(expression) == expected
    )


def test_conditional_is_lazy_and_unknown_never_picks_a_branch():
    expression = EXPRESSION.validate_python(
        {
            "op": "if",
            "condition": predicate("mode"),
            "then": 0,
            "otherwise": {"attribute": "missing"},
        }
    )
    context = EvaluationContext({"mode": True}.get)
    assert context.value(expression) == 0
    assert not context.missing
    assert EvaluationContext({}.get).value(expression) is None


def test_is_known_is_explicit_false_and_not_unknown():
    condition = CONDITION.validate_python(
        {
            "op": "not",
            "condition": {"op": "is_known", "value": {"attribute": "missing"}},
        }
    )
    assert EvaluationContext({}.get).condition(condition) is True


def test_operation_budget_is_shared_by_child_evaluations():
    parent = EvaluationBudget(1)
    EvaluationContext({}.get, budget=EvaluationBudget(parent=parent)).value(0)
    with pytest.raises(EvaluationLimitError):
        EvaluationContext({}.get, budget=EvaluationBudget(parent=parent)).value(0)


@pytest.mark.parametrize(
    "expression",
    [
        {"path": "other.device"},
        {"attribute": "a", "default": 42},
        {"op": "multiply", "args": [2, 3]},
        float("inf"),
        float("nan"),
    ],
)
def test_language_is_closed(expression):
    with pytest.raises(ValidationError):
        EXPRESSION.validate_python(expression)


@pytest.mark.parametrize(
    ("op", "left", "right", "expected"),
    [
        ("lt", 1, 2, True),
        ("lte", 2, 2, True),
        ("gt", 3, 2, True),
        ("gte", 1, 2, False),
        ("lt", True, 2, None),
        ("gt", None, 2, None),
    ],
)
def test_numeric_ordering_and_unknown(op, left, right, expected):
    expression = CONDITION.validate_python(
        {"op": op, "left": {"attribute": "a"}, "right": right}
    )
    assert EvaluationContext({"a": left}.get).condition(expression) is expected


@pytest.mark.parametrize(("value", "expected"), [(None, None), (3, False), (2, True)])
def test_membership_unknown_and_absent_values(value, expected):
    condition = CONDITION.validate_python(
        {"op": "in", "value": {"attribute": "a"}, "values": [1, 2]}
    )
    assert EvaluationContext({"a": value}.get).condition(condition) is expected


@pytest.mark.parametrize("value", [None, True, float("inf"), 10**400])
def test_arithmetic_never_publishes_invalid_or_overflowed_results(value):
    expression = EXPRESSION.validate_python(
        {"op": "add", "args": [{"attribute": "a"}, 1.0]}
    )
    assert EvaluationContext({"a": value}.get).value(expression) is None


def test_runtime_depth_budget_is_enforced():
    expression = EXPRESSION.validate_python({"attribute": "a"})
    with pytest.raises(EvaluationLimitError):
        EvaluationContext({"a": 1}.get).value(expression, depth=17)
