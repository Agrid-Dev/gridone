"""Compose site rules into the existing bounded write decision."""

from __future__ import annotations

import hashlib
import json
import logging
from typing import TYPE_CHECKING

from models.conditions import (
    EvaluationBudget,
    EvaluationContext,
    EvaluationLimitError,
    scalar_equal,
)
from models.expressions import MAX_DEVICE_OPERATIONS, MAX_RULES
from models.write_rules import WriteEvaluation, WriteReason

if TYPE_CHECKING:
    from models.attribute_observation import AttributeInspector, AttributeResolver
    from models.command_confirmation import WriteConsent
    from models.expressions import DeviceAttributeRef
    from models.operating_rules import OperatingRule
    from models.types import AttributeValueType

    from .service import OperatingRulesService

from .references import invalid_reference_reason

logger = logging.getLogger(__name__)


class OperatingRuleGuard:
    def __init__(
        self,
        provider: OperatingRulesService,
        inspect_attribute: AttributeInspector,
        resolve_attribute: AttributeResolver,
    ) -> None:
        self._provider = provider
        self._inspect = inspect_attribute
        self._resolve = resolve_attribute

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

    def __call__(
        self,
        device_id: str,
        attribute: str,
        evaluation: WriteEvaluation,
        consent: WriteConsent | None = None,
    ) -> WriteEvaluation:
        """Evaluate every applicable rule; a known denial always beats consent.

        There is no await or transport acquisition here. Other devices are read
        without their write locks: this is intentionally not mutual exclusion.
        """
        if evaluation.value is None:
            return evaluation
        try:
            rules = self._provider.for_target(device_id, attribute)
            return self._evaluate(rules, evaluation, consent)
        except Exception:
            logger.exception("Failed to evaluate site operating rules")
            return evaluation.model_copy(
                update={
                    "eligible": False,
                    "consent_required": False,
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
        consent: WriteConsent | None,
    ) -> WriteEvaluation:
        """Share a device budget across rules and bind acknowledgements to revisions."""
        result = evaluation.model_copy(deep=True)
        result.policy_binding = self._binding(rules)
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
        result.unknown_requirement_ids = unknown
        acknowledged = (
            consent is not None
            and consent.binding == result.policy_binding
            and set(unknown) <= set(consent.requirement_ids)
        )
        if acknowledged and consent is not None:
            result.consent = consent
            result.warnings.extend(
                reason for reason in reasons if reason.code == "operating_rule_unknown"
            )
            reasons = [
                reason for reason in reasons if reason.code != "operating_rule_unknown"
            ]
        result.reasons.extend(reasons)
        result.eligible = evaluation.eligible and not result.reasons
        result.consent_required = bool(result.reasons) and all(
            reason.code == "operating_rule_unknown" for reason in result.reasons
        )
        return result

    def _reason(
        self,
        rule: OperatingRule,
        value: AttributeValueType | None,
        parent: EvaluationBudget,
    ) -> WriteReason | None:
        """Broken contracts fail closed even in a branch that would short-circuit."""
        budget = EvaluationBudget(parent=parent)
        try:
            if reason := invalid_reference_reason(
                rule, self._inspect, target_only=True, budget=budget
            ):
                return reason
            if not scalar_equal(rule.target.value, value):
                return None
            if reason := invalid_reference_reason(rule, self._inspect, budget=budget):
                return reason

            invalid = False

            def resolve(reference: DeviceAttributeRef) -> AttributeValueType | None:
                nonlocal invalid
                observation = self._resolve(
                    reference, max_age_seconds=rule.max_age_seconds
                )
                invalid |= observation.validity == "invalid"
                return observation.value if observation.validity == "known" else None

            context = EvaluationContext(
                lambda _: None,
                candidate=value,
                budget=budget,
                resolve_attribute=resolve,
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
