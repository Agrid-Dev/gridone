"""Resolved write results are plain models: the API omits their unset fields."""

from models.attribute_metadata import LocalizedText
from models.write_rules import (
    AttributeWriteState,
    ResolvedConstraints,
    ResolvedOption,
    WriteReason,
)

RULE_REASON = WriteReason(
    code="locked",
    message=LocalizedText(default="Locked by the night rule"),
    operating_rule_id="night",
    operating_rule_explanation="Comfort is off at night",
)


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


def test_unset_fields_are_omitted_only_on_request():
    # The models keep their nulls; the API's exits pass exclude_none natively,
    # which is cheaper than a serialiser callback per attribute.
    reason = WriteReason(code="not_writable")

    assert reason.model_dump() == {
        "code": "not_writable",
        "message": None,
        "operating_rule_id": None,
        "operating_rule_explanation": None,
    }
    assert reason.model_dump(exclude_none=True) == {"code": "not_writable"}
