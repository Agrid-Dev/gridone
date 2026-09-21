"""Compose site rules into the existing bounded write decision."""

from __future__ import annotations

import hashlib
import json
import logging
from typing import TYPE_CHECKING

from devices_manager.core.conditions import (
    EvaluationBudget,
    EvaluationContext,
    EvaluationLimitError,
    scalar_equal,
)
from models.expressions import MAX_DEVICE_OPERATIONS, MAX_RULES
from models.write_rules import WriteEvaluation, WriteReason

if TYPE_CHECKING:
    from models.command_confirmation import OperatingRuleConfirmation
    from models.expressions import DevicePointRef
    from models.operating_rules import (
        OperatingRule,
        OperatingRuleProvider,
        PointInspector,
        PointResolver,
    )
    from models.types import AttributeValueType

logger = logging.getLogger(__name__)


class OperatingRuleGuard:
    def __init__(
        self,
        provider: OperatingRuleProvider,
        inspect_point: PointInspector,
        resolve_point: PointResolver,
    ) -> None:
        self._provider = provider
        self._inspect = inspect_point
        self._resolve = resolve_point

    def binding(self, device_id: str, attribute: str) -> str:
        return self._binding(self._provider.for_target(device_id, attribute))

    @staticmethod
    def _binding(rules: list[OperatingRule]) -> str:
        payload = [
            rule.model_dump(mode="json")
            for rule in sorted(rules, key=lambda rule: rule.id)
        ]
        return hashlib.sha256(
            json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()

    def evaluate(
        self,
        device_id: str,
        attribute: str,
        evaluation: WriteEvaluation,
        confirmation: OperatingRuleConfirmation | None = None,
    ) -> WriteEvaluation:
        """Evaluate every applicable rule; a known denial always beats confirmation.

        There is no await or transport acquisition here. Other devices are read
        without their write locks: this is intentionally not mutual exclusion.
        """
        if evaluation.value is None:
            return evaluation
        try:
            rules = self._provider.for_target(device_id, attribute)
            return self._evaluate(rules, evaluation, confirmation)
        except Exception:
            logger.exception("Failed to evaluate site operating rules")
            return evaluation.model_copy(
                update={
                    "eligible": False,
                    "reasons": [
                        *evaluation.reasons,
                        WriteReason(code="operating_rule_unavailable"),
                    ],
                }
            )

    def _evaluate(
        self,
        rules: list[OperatingRule],
        evaluation: WriteEvaluation,
        confirmation: OperatingRuleConfirmation | None,
    ) -> WriteEvaluation:
        """Share a device budget across rules and bind acknowledgements to revisions."""
        result = evaluation.model_copy(deep=True)
        result.operating_rule_binding = self._binding(rules)
        budget = EvaluationBudget(MAX_DEVICE_OPERATIONS)
        reasons = []
        if len(rules) > MAX_RULES:
            reasons.append(WriteReason(code="evaluation_limit"))
        else:
            for rule in rules:
                reason = self._reason(rule, result.value, budget)
                if reason is not None:
                    reasons.append(reason)
        unknown = [
            reason.operating_rule_id
            for reason in reasons
            if reason.code == "operating_rule_unknown"
            and reason.operating_rule_id is not None
        ]
        result.unknown_operating_rule_ids = unknown
        acknowledged = (
            confirmation is not None
            and confirmation.binding == result.operating_rule_binding
            and set(unknown) <= set(confirmation.operating_rule_ids)
        )
        if acknowledged and confirmation is not None:
            result.operating_rule_confirmation = confirmation
            result.warnings.extend(
                reason for reason in reasons if reason.code == "operating_rule_unknown"
            )
            reasons = [
                reason for reason in reasons if reason.code != "operating_rule_unknown"
            ]
        result.reasons.extend(reasons)
        result.eligible = evaluation.eligible and not result.reasons
        return result

    def _target_invalid(self, rule: OperatingRule) -> bool:
        """Type drift must not silently make the protected value stop matching."""
        definition = self._inspect(rule.target)
        contract = next(
            (
                point
                for point in rule.points
                if point.device_id == rule.target.device_id
                and point.attribute == rule.target.attribute
            ),
            None,
        )
        return (
            definition is None
            or contract is None
            or definition.data_type != contract.data_type
            or not definition.writable
        )

    def _reason(
        self,
        rule: OperatingRule,
        value: AttributeValueType | None,
        parent: EvaluationBudget,
    ) -> WriteReason | None:
        """Broken contracts fail closed even in a branch that would short-circuit."""
        budget = EvaluationBudget(parent=parent)
        try:
            budget.spend()
            if self._target_invalid(rule):
                return WriteReason(
                    code="operating_rule_reference_invalid",
                    operating_rule_id=rule.id,
                    operating_rule_explanation=rule.explanation,
                )
            if not scalar_equal(rule.target.value, value):
                return None
            for point in rule.points:
                budget.spend()
                definition = self._inspect(point)
                if definition is None or definition.data_type != point.data_type:
                    return WriteReason(
                        code="operating_rule_reference_invalid",
                        operating_rule_id=rule.id,
                        operating_rule_explanation=rule.explanation,
                    )

            invalid = False

            def resolve(point: DevicePointRef) -> AttributeValueType | None:
                nonlocal invalid
                observation = self._resolve(point, max_age_seconds=rule.max_age_seconds)
                invalid |= observation.validity == "invalid"
                return observation.value if observation.validity == "known" else None

            context = EvaluationContext(
                lambda _: None, candidate=value, budget=budget, resolve_point=resolve
            )
            allowed = context.condition(rule.condition)
            code = (
                "operating_rule_reference_invalid"
                if invalid
                else "operating_rule_unknown"
                if allowed is None
                else "operating_rule_blocked"
                if not allowed
                else None
            )
        except EvaluationLimitError:
            code = "evaluation_limit"
        return (
            WriteReason(
                code=code,
                operating_rule_id=rule.id,
                operating_rule_explanation=rule.explanation,
            )
            if code
            else None
        )
