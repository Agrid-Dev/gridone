"""Ordered branch selection using the shared, bounded expression evaluator."""

from __future__ import annotations

from typing import TYPE_CHECKING

from automations.models import BranchEvaluation
from models.attribute_observation import AttributeObservation
from models.conditions import EvaluationBudget, EvaluationContext
from models.expressions import (
    MAX_DEVICE_OPERATIONS,
    DeviceAttributeRef,
    expression_nodes,
)

if TYPE_CHECKING:
    from collections.abc import Callable

    from automations.models import Automation, AutomationBranch, TriggerContext
    from models.attribute_observation import AttributeResolver
    from models.expressions import Condition
    from models.types import AttributeValueType


def select_branch(
    automation: Automation,
    event: TriggerContext,
    resolver: AttributeResolver | None,
    trace: list[BranchEvaluation],
) -> AutomationBranch | None:
    """Follow the first match at each level to a terminal action.

    A matched subtree owns the rest of the selection: if none of its children
    matches, no ancestor fallback is considered. Unknown stops the whole tree.

    All branches share one tree budget. Each branch gets the same local budget
    used by write rules. Resolution is synchronous, so one selection cannot
    interleave with another observed update on the service's event loop.
    """
    parent = EvaluationBudget(MAX_DEVICE_OPERATIONS)
    observations: dict[DeviceAttributeRef, AttributeObservation] = {}

    def observation(reference: DeviceAttributeRef) -> AttributeObservation:
        if reference not in observations and resolver is not None:
            observations[reference] = resolver(
                reference, max_age_seconds=automation.max_age_seconds
            )
        return observations.get(reference, AttributeObservation(validity="unknown"))

    def resolve(reference: DeviceAttributeRef) -> AttributeValueType | None:
        if resolver is None:
            return None
        acquired = observation(reference)
        return (
            acquired.value
            if acquired is not None and acquired.validity == "known"
            else None
        )

    pending = [
        (branch, [index])
        for index, branch in reversed(list(enumerate(automation.branches, 1)))
    ]
    while pending:
        branch, path = pending.pop()
        context = EvaluationContext(
            lambda _: None,
            budget=EvaluationBudget(parent=parent),
            resolve_attribute=resolve,
            resolve_event=event.event_value,
        )
        invalid = _invalid_references(branch.condition, context, observation)
        result = (
            None
            if invalid
            else (
                True
                if branch.condition is None
                else context.condition(branch.condition)
            )
        )
        trace.append(
            BranchEvaluation(
                branch_id=branch.id,
                path=path,
                result="unknown"
                if result is None
                else "matched"
                if result
                else "not_matched",
                missing=sorted(context.missing),
            )
        )
        if result is None:
            return None
        if result:
            if branch.branches:
                pending = [
                    (child, [*path, index])
                    for index, child in reversed(list(enumerate(branch.branches, 1)))
                ]
                continue
            return branch
    return None


def _invalid_references(
    condition: Condition | None,
    context: EvaluationContext,
    observation: Callable[[DeviceAttributeRef], AttributeObservation],
) -> bool:
    """Broken references cannot hide in a short-circuited condition."""
    invalid = False
    for _, node, _ in expression_nodes(condition):
        context.budget.spend()
        if (
            isinstance(node, DeviceAttributeRef)
            and observation(node).validity == "invalid"
        ):
            context.missing.add(f"{node.device_id}/{node.attribute}")
            invalid = True
    return invalid
