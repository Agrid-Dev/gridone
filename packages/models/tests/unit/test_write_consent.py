"""Previously stored command evidence remains readable after generalizing consent."""

from datetime import UTC, datetime

from models.write_rules import WriteEvaluation


def test_legacy_validation_loads_and_serializes_generic_policy_fields():
    evaluation = WriteEvaluation.model_validate(
        {
            "eligible": True,
            "value": True,
            "operating_rule_binding": "revision",
            "unknown_operating_rule_ids": ["rule"],
            "operating_rule_confirmation": {
                "binding": "revision",
                "operating_rule_ids": ["rule"],
                "actor_id": "operator",
                "confirmed_at": datetime.now(UTC),
            },
        }
    )
    assert evaluation.policy_binding == "revision"
    assert evaluation.unknown_requirement_ids == ["rule"]
    assert evaluation.consent is not None
    assert evaluation.consent.requirement_ids == ["rule"]
    assert evaluation.consent.actor_id == "operator"
    payload = evaluation.model_dump()
    assert "operating_rule_binding" not in payload
    assert "operating_rule_confirmation" not in payload
    assert "operating_rule_ids" not in payload["consent"]
    assert WriteEvaluation.model_validate(payload) == evaluation
