"""Resolved write results serialise without their unset fields."""

import pytest

from models.attribute_metadata import LocalizedText
from models.write_rules import (
    AttributeWriteState,
    ResolvedConstraints,
    ResolvedOption,
    WriteReason,
)

# A reason is almost always a bare code; the other fields only matter when an
# operating rule or a driver message set them.
BARE_REASON = WriteReason(code="not_writable")
RULE_REASON = WriteReason(
    code="locked",
    message=LocalizedText(default="Locked by the night rule"),
    operating_rule_id="night",
    operating_rule_explanation="Comfort is off at night",
)


@pytest.mark.parametrize(
    ("model", "expected"),
    [
        pytest.param(BARE_REASON, {"code": "not_writable"}, id="bare-reason"),
        pytest.param(
            RULE_REASON,
            {
                "code": "locked",
                "message": {"default": "Locked by the night rule", "translations": {}},
                "operating_rule_id": "night",
                "operating_rule_explanation": "Comfort is off at night",
            },
            id="rule-reason-keeps-its-fields",
        ),
        pytest.param(
            ResolvedConstraints(step=0.5, unknown=["minimum", "maximum"]),
            {"step": 0.5, "unknown": ["minimum", "maximum"], "sentinels": []},
            id="constraints-keep-known-bounds-only",
        ),
        pytest.param(
            ResolvedOption(value=1, available=False, reasons=[BARE_REASON]),
            {"value": 1, "available": False, "reasons": [{"code": "not_writable"}]},
            id="option-reasons-are-bare-too",
        ),
        pytest.param(
            AttributeWriteState(status="blocked", reasons=[BARE_REASON]),
            {
                "status": "blocked",
                "support": "supported",
                "reasons": [{"code": "not_writable"}],
                "warnings": [],
                "missing_dependencies": False,
                "missing_attributes": [],
                "candidate_required": False,
            },
            id="state-without-constraints-or-options",
        ),
    ],
)
def test_unset_fields_are_omitted_from_payloads(model, expected):
    assert model.model_dump(mode="json") == expected
    assert type(model).model_validate(expected) == model


def test_a_full_state_round_trips():
    state = AttributeWriteState(
        status="ready",
        constraints=ResolvedConstraints(minimum=5, maximum=30, step=0.5),
        options=[
            ResolvedOption(value=True, available=True),
            ResolvedOption(value=False, available=False, reasons=[RULE_REASON]),
        ],
        warnings=[RULE_REASON],
        missing_attributes=["mode"],
    )

    payload = state.model_dump(mode="json")

    assert payload["constraints"] == {
        "minimum": 5.0,
        "maximum": 30.0,
        "step": 0.5,
        "unknown": [],
        "sentinels": [],
    }
    assert payload["options"][1]["reasons"][0]["operating_rule_id"] == "night"
    assert AttributeWriteState.model_validate(payload) == state
