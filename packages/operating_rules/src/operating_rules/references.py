"""One contract check for configuration diagnostics and live write decisions."""

from __future__ import annotations

from typing import TYPE_CHECKING

from models.expressions import DeviceAttributeRef
from models.operating_rules import operating_rule_attributes
from models.write_rules import WriteReason

if TYPE_CHECKING:
    from models.attribute_observation import AttributeInspector
    from models.conditions import EvaluationBudget
    from models.operating_rules import OperatingRule


def invalid_reference_reason(
    rule: OperatingRule,
    inspect_attribute: AttributeInspector,
    *,
    target_only: bool = False,
    budget: EvaluationBudget | None = None,
) -> WriteReason | None:
    """Check saved types and target writability, including missing contracts.

    Target drift must block even when the requested value no longer matches.
    Other references are checked only for the governed value at write time,
    including references in branches that would otherwise short-circuit.
    """
    target = DeviceAttributeRef(
        device_id=rule.target.device_id, attribute=rule.target.attribute
    )
    contracts = {
        DeviceAttributeRef(device_id=item.device_id, attribute=item.attribute): item
        for item in rule.attributes
    }
    references = (
        [target]
        if target_only
        else list(dict.fromkeys([target, *operating_rule_attributes(rule), *contracts]))
    )
    for reference in references:
        if budget is not None:
            budget.spend()
        definition = inspect_attribute(reference)
        contract = contracts.get(reference)
        if (
            definition is None
            or contract is None
            or definition.data_type != contract.data_type
            or (reference == target and not definition.writable)
        ):
            return WriteReason(
                code="operating_rule_reference_invalid",
                operating_rule_id=rule.id,
                operating_rule_explanation=rule.explanation,
            )
    return None
