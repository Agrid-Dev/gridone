"""Server-resolved interaction and page state, independent from command guards."""

from __future__ import annotations

from typing import TYPE_CHECKING

from pydantic import ValidationError

from devices_manager.core.conditions import (
    EvaluationBudget,
    EvaluationContext,
    EvaluationLimitError,
)
from models.expressions import MAX_DEVICE_OPERATIONS

from .group_conditions import command_condition
from .models import ButtonLayer, DeviceFaceNode, PresentationV1, VariantNode
from .validation import walk_page_nodes

if TYPE_CHECKING:
    from devices_manager.core.conditions import ValueResolver
    from models.types import AttributeValueType

    from .envelope import PresentationEnvelope
    from .models import Condition, PageNode


def compile_presentation(
    envelope: PresentationEnvelope | None,
) -> PresentationV1 | None:
    if envelope is None:
        return None
    try:
        return PresentationV1.model_validate(envelope.document)
    except ValidationError:
        return None


def project_presentation(
    document: PresentationV1 | None, resolve: ValueResolver
) -> dict[str, bool]:
    """Resolve page visibility and interaction without client rule evaluation."""
    if document is None:
        return {}

    def binding_value(binding: str) -> AttributeValueType | None:
        spec = document.bindings.get(binding)
        return resolve(spec.attribute) if spec else None

    context = EvaluationContext(
        binding_value, budget=EvaluationBudget(MAX_DEVICE_OPERATIONS)
    )
    state: dict[str, bool] = {}
    for key, control in document.controls.items():
        if control.visible_when:
            state[f"/controls/{key}/visible"] = _matches(
                control.visible_when, context, expected=True
            )
        if control.blocked_when:
            state[f"/controls/{key}/enabled"] = _matches(
                control.blocked_when, context, expected=False
            )
    for node, path, _ in walk_page_nodes(document.page, "/page"):
        _project_node(node, path, context, state)
    return state


def _matches(
    condition: Condition, context: EvaluationContext, *, expected: bool
) -> bool:
    try:
        return context.condition(command_condition(condition)) is expected
    except EvaluationLimitError:
        return False


def _project_node(
    node: PageNode, path: str, context: EvaluationContext, state: dict[str, bool]
) -> None:
    if node.visible_when:
        state[f"{path}/visible"] = _matches(node.visible_when, context, expected=True)
    if isinstance(node, VariantNode):
        selected = False
        for i, variant in enumerate(node.variants):
            enabled = not selected and _matches(variant.when, context, expected=True)
            state[f"{path}/variants/{i}/selected"] = enabled
            selected |= enabled
    if isinstance(node, DeviceFaceNode):
        for i, layer in enumerate(node.layers):
            if isinstance(layer, ButtonLayer) and layer.blocked_when:
                state[f"{path}/layers/{i}/enabled"] = _matches(
                    layer.blocked_when, context, expected=False
                )
