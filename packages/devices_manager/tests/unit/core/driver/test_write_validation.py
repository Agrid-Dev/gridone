"""Driver-author feedback for invalid declarations and reusable expression types."""

import pytest
from pydantic import ValidationError

from devices_manager.core.driver import AttributeDriver
from devices_manager.core.driver.driver import attributes_referencing
from devices_manager.core.driver.write_validation import (
    rename_write_references,
    validate_write_declarations,
)
from models.errors import InvalidError


def attribute(**fields: object):
    return AttributeDriver.model_validate(
        {
            "name": "target",
            "data_type": "float",
            "read": "/target",
            "write": "/target",
            **fields,
        }
    )


def rule(condition):
    return {"condition": condition, "reason": {"code": "blocked"}}


@pytest.mark.parametrize(
    "fields",
    [
        {"write_constraints": {"maximum": {"op": "add", "args": [1, True]}}},
        {"write_constraints": {"minimum": {"candidate": True}}},
        {
            "write_constraints": {
                "minimum": {
                    "op": "if",
                    "condition": {"op": "is_known", "value": 1},
                    "then": 1,
                    "otherwise": "x",
                }
            }
        },
        {"write_rules": [rule({"op": "eq", "left": True, "right": 1})]},
        {"write_rules": [rule({"op": "lt", "left": "a", "right": "b"})]},
        {
            "write_rules": [
                rule({"op": "in", "value": {"candidate": True}, "values": [1, "x"]})
            ]
        },
        {
            "write_rules": [
                rule({"op": "eq", "left": {"attribute": "missing"}, "right": 1})
            ]
        },
        {"write_options": [{"value": 1}, {"value": 1.0}]},
        {"write_options": [{"value": True}]},
        {"value_mapping": {"entries": [{"code": 1, "value": "x"}]}},
        {"value_mapping": {"entries": [{"code": 1, "value": 1}], "stop_value": "end"}},
        {"value_mapping": {"entries": [{"code": 1, "value": {"candidate": True}}]}},
        {
            "value_mapping": {
                "entries": [{"code": 1, "value": 1}, {"code": 1.0, "value": 2}]
            }
        },
        {"default_value": False},
        {"default_value": "x"},
        {"default_value": 2, "write_constraints": {"minimum": 3}},
        {"default_value": 2, "write_constraints": {"maximum": 1}},
        {"default_value": 2.5, "write_constraints": {"step": 1}},
    ],
)
def test_invalid_driver_declaration_reports_a_problem(fields):
    with pytest.raises((InvalidError, ValidationError)):
        validate_write_declarations([attribute(**fields)])


@pytest.mark.parametrize(
    "condition",
    [
        {"op": "not", "condition": {"op": "is_known", "value": {"attribute": "floor"}}},
        {
            "op": "all",
            "conditions": [
                {"op": "in", "value": {"candidate": True}, "values": [1, 2]}
            ],
        },
        {
            "op": "any",
            "conditions": [
                {
                    "op": "lte",
                    "left": {"candidate": True},
                    "right": {"op": "max", "args": [{"attribute": "floor"}, 2]},
                }
            ],
        },
    ],
)
def test_typed_candidate_conditions_are_valid_at_import(condition):
    validate_write_declarations(
        [attribute(write_rules=[rule(condition)]), attribute(name="floor")]
    )


def test_conditional_mapping_and_options_validate_and_follow_renames():
    condition = {"op": "is_known", "value": {"attribute": "floor"}}
    target = attribute(
        default_value=0,
        write_constraints={"minimum": 10, "sentinels": [0]},
        write_rules=[rule(condition)],
        write_options=[{"value": 0, "allowed_when": condition}],
        value_mapping={
            "entries": [
                {
                    "code": 0,
                    "value": {
                        "op": "if",
                        "condition": condition,
                        "then": 0,
                        "otherwise": {"attribute": "floor"},
                    },
                }
            ]
        },
    )
    floor = attribute(
        name="floor", write_constraints={"minimum": {"attribute": "target"}}
    )
    validate_write_declarations([target, floor])
    assert attributes_referencing([target, floor], "floor") == [target]
    renamed = rename_write_references(target, "floor", "lower")
    validate_write_declarations([renamed, attribute(name="lower")])
    assert not attributes_referencing([renamed], "floor")
    assert attributes_referencing([renamed], "lower") == [renamed]


def test_expression_depth_is_checked_before_evaluation():
    expression = {"attribute": "floor"}
    for _ in range(17):
        expression = {"op": "add", "args": [expression, 1]}
    with pytest.raises(InvalidError, match="depth budget"):
        validate_write_declarations(
            [
                attribute(write_constraints={"minimum": expression}),
                attribute(name="floor"),
            ]
        )


def test_declaration_budget_cannot_be_raised_by_a_driver():
    condition = {"op": "in", "value": {"candidate": True}, "values": list(range(256))}
    with pytest.raises(InvalidError, match="operation budget"):
        validate_write_declarations(
            [attribute(write_rules=[rule(condition) for _ in range(64)])]
        )
