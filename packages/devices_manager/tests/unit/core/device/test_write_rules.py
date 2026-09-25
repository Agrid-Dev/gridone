"""Pure write evaluation and projection over a resolver of trusted values."""

import pytest

from devices_manager.core.device.write_rules import (
    evaluate_write,
    project_write_state,
)
from devices_manager.core.driver import AttributeDriver
from models.conditions import EvaluationBudget, EvaluationContext


def spec(**fields: object):
    return AttributeDriver.model_validate(
        {
            "name": "target",
            "data_type": "float",
            "read": "GET /target",
            "write": "POST /target",
            **fields,
        }
    )


def rule(condition, effect="require"):
    return {
        "condition": condition,
        "effect": effect,
        "reason": {
            "code": "locked",
            "message": {"default": "Locked", "translations": {"fr": "Verrouillé"}},
        },
    }


@pytest.mark.parametrize(
    ("locked", "reasons", "status"),
    [
        (0, [], "ready"),
        (1, ["locked"], "blocked"),
        (None, ["unknown_dependencies"], "unknown"),
    ],
)
def test_candidate_guard_is_conservative(locked, reasons, status):
    contract = spec(
        write_rules=[rule({"op": "eq", "left": {"attribute": "lock"}, "right": 0})]
    )
    result = evaluate_write(contract, 22, {"lock": locked}.get)
    assert [r.code for r in result.reasons] == reasons
    assert result.eligible is (not reasons)
    assert result.value == 22
    assert project_write_state(contract, {"lock": locked}.get).status == status
    if reasons == ["locked"]:
        assert result.reasons[0].message is not None
        assert result.reasons[0].message.translations["fr"] == "Verrouillé"


def test_known_refusal_blocks_despite_an_unknown_rule():
    contract = spec(
        write_rules=[
            rule({"op": "eq", "left": {"attribute": "lock"}, "right": 0}),
            rule({"op": "eq", "left": {"attribute": "mode"}, "right": 1}),
        ]
    )
    resolve = {"lock": 1, "mode": None}.get
    reasons = [r.code for r in evaluate_write(contract, 22, resolve).reasons]
    assert reasons == ["locked", "unknown_dependencies"]
    state = project_write_state(contract, resolve)
    assert state.status == "blocked"
    assert state.missing_dependencies


def test_arithmetic_candidate_guard_and_warning():
    condition = {
        "op": "lte",
        "left": {"candidate": True},
        "right": {"op": "subtract", "args": [{"attribute": "ceiling"}, 2]},
    }
    contract = spec(
        write_rules=[
            rule(condition),
            rule({"op": "is_known", "value": {"attribute": "ceiling"}}, "warn"),
        ]
    )
    assert project_write_state(contract, {"ceiling": 24}.get).candidate_required
    result = evaluate_write(contract, 22, {"ceiling": 24}.get)
    assert result.eligible
    assert result.warnings
    assert not evaluate_write(contract, 23, {"ceiling": 24}.get).eligible


def test_sentinel_bypasses_unknown_bounds_but_not_guards():
    contract = spec(
        write_constraints={"minimum": {"attribute": "floor"}, "sentinels": [0]}
    )
    assert project_write_state(contract, {}.get).status == "ready"
    assert evaluate_write(contract, 0, {}.get).eligible
    assert not evaluate_write(contract, 22, {}.get).eligible


def test_full_size_table_projects_without_quadratic_evaluation():
    contract = spec(
        value_mapping={"entries": [{"code": i, "value": i} for i in range(256)]}
    )
    state = project_write_state(contract, {}.get)
    assert state.status == "ready"
    assert state.options is not None
    assert len(state.options) == 256
    assert all(option.available for option in state.options)


@pytest.mark.parametrize(
    ("authored", "locked", "reason", "status"),
    [
        (None, True, "option_unavailable", "blocked"),
        (None, None, "unknown_dependencies", "unknown"),
        ({"code": "incompatible"}, True, "incompatible", "blocked"),
        ({"code": "incompatible"}, None, "unknown_dependencies", "unknown"),
    ],
)
def test_conditional_options_are_projected_and_enforced(
    authored, locked, reason, status
):
    contract = spec(
        write_options=[
            {
                "value": 22,
                "allowed_when": {
                    "op": "eq",
                    "left": {"attribute": "locked"},
                    "right": False,
                },
                "reason": authored,
            }
        ]
    )
    result = evaluate_write(contract, 22, {"locked": locked}.get)
    assert not result.eligible
    assert [r.code for r in result.reasons] == [reason]
    state = project_write_state(contract, {"locked": locked}.get)
    assert state.options is not None
    assert not state.options[0].available
    assert state.options[0].reasons == result.reasons
    assert state.status == status
    assert not evaluate_write(contract, 23, {"locked": False}.get).eligible


@pytest.mark.parametrize(
    ("values", "reasons"),
    [
        (
            {"slot_0": "fan", "lock": 0},
            {
                "fan": [],
                "heat": ["unknown_dependencies"],
                "cool": ["unknown_dependencies"],
            },
        ),
        (
            {"slot_0": "fan", "lock": 0, "mode_ok": False},
            {"fan": [], "heat": ["unknown_dependencies"], "cool": ["incompatible"]},
        ),
        (
            {"slot_0": "fan", "lock": 1, "mode_ok": True},
            {
                "fan": ["locked"],
                "heat": ["unknown_dependencies"],
                "cool": ["unknown_dependencies"],
            },
        ),
    ],
)
def test_projected_options_give_the_reasons_a_write_gives(values, reasons):
    contract = spec(
        data_type="str",
        write_options=[
            {"value": "fan"},
            {"value": "heat"},
            {
                "value": "cool",
                "allowed_when": {
                    "op": "eq",
                    "left": {"attribute": "mode_ok"},
                    "right": True,
                },
                "reason": {"code": "incompatible"},
            },
        ],
        value_mapping={
            "entries": [
                {"code": i, "value": {"attribute": f"slot_{i}"}} for i in range(3)
            ],
            "duplicates": "first",
            "stop_value": "error",
        },
        write_rules=[rule({"op": "eq", "left": {"attribute": "lock"}, "right": 0})],
    )
    state = project_write_state(contract, values.get)
    assert state.options is not None
    assert {o.value: [r.code for r in o.reasons] for o in state.options} == reasons
    for option in state.options:
        assert evaluate_write(contract, option.value, values.get).reasons == (
            option.reasons
        )


def test_authored_option_reason_and_candidate_are_preserved():
    contract = spec(
        write_options=[
            {
                "value": 22,
                "allowed_when": {"op": "lt", "left": {"candidate": True}, "right": 20},
                "reason": {"code": "too_high"},
            }
        ]
    )
    assert evaluate_write(contract, 22, {}.get).reasons[0].code == "too_high"


@pytest.mark.parametrize("value", [float("inf"), float("nan"), "not-a-number", True])
def test_invalid_candidate_types_are_rejected(value):
    assert evaluate_write(spec(), value, {}.get).reasons[0].code == "invalid_value"


def test_budget_exhaustion_blocks_projection_and_candidate():
    contract = spec(
        write_rules=[rule({"op": "eq", "left": {"candidate": True}, "right": 22})]
    )
    context = EvaluationContext({}.get, candidate=22, budget=EvaluationBudget(0))
    assert (
        evaluate_write(contract, 22, {}.get, context=context).reasons[0].code
        == "evaluation_limit"
    )
    contract = spec(
        write_rules=[rule({"op": "is_known", "value": {"attribute": "lock"}})]
    )
    assert (
        project_write_state(contract, {"lock": False}.get, budget=EvaluationBudget(0))
        .reasons[0]
        .code
        == "evaluation_limit"
    )
