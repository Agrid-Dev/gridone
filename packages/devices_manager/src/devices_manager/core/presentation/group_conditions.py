"""Conservative per-member control gating for absolute group commands."""

from __future__ import annotations

from typing import TYPE_CHECKING

from pydantic import ValidationError

from devices_manager.core.conditions import EvaluationContext
from models.expressions import (
    AttributeRef,
    Comparison,
    IsKnown,
    Junction,
    Membership,
    Negation,
)
from models.expressions import Condition as CommandCondition

from .capabilities import DOCUMENT_BUDGETS
from .models import (
    ButtonLayer,
    ColumnsNode,
    DeviceFaceNode,
    EqCondition,
    InCondition,
    IsKnownCondition,
    NotCondition,
    PresentationV1,
    SectionNode,
    StackNode,
)

if TYPE_CHECKING:
    from collections.abc import Iterator

    from devices_manager.core.device.write_constraints import ValueResolver
    from devices_manager.types import AttributeValueType

    from .envelope import PresentationEnvelope
    from .models import Condition, PageNode


def command_condition(condition: Condition) -> CommandCondition:
    """Adapt legacy presentation binding operands to the shared expression tree."""
    if isinstance(condition, EqCondition):
        return Comparison(
            op="eq",
            left=AttributeRef(attribute=condition.binding),
            right=condition.value,
        )
    if isinstance(condition, InCondition):
        return Membership(
            op="in",
            value=AttributeRef(attribute=condition.binding),
            values=condition.values,
        )
    if isinstance(condition, IsKnownCondition):
        return IsKnown(op="is_known", value=AttributeRef(attribute=condition.binding))
    if isinstance(condition, NotCondition):
        return Negation(op="not", condition=command_condition(condition.condition))
    return Junction(
        op=condition.op,
        conditions=[command_condition(child) for child in condition.conditions],
    )


def evaluate_condition(
    condition: Condition, resolve: ValueResolver, *, depth: int = 1
) -> bool | None:
    """Compatibility adapter; all Python conditions use the common evaluator."""
    if depth > DOCUMENT_BUDGETS.max_condition_depth:
        return None
    return EvaluationContext(resolve).condition(command_condition(condition))


def _buttons(node: PageNode) -> Iterator[ButtonLayer]:
    if isinstance(node, DeviceFaceNode):
        yield from (layer for layer in node.layers if isinstance(layer, ButtonLayer))
    elif isinstance(node, StackNode | SectionNode):
        for child in node.children:
            yield from _buttons(child)
    elif isinstance(node, ColumnsNode):
        for item in node.items:
            yield from _buttons(item.content)


def group_write_blocked(
    envelope: PresentationEnvelope | None, attribute: str, resolve: ValueResolver
) -> bool:
    """Require every declared blocking condition for this control to be false.

    A group sends an absolute attribute value, rather than a particular face
    button action, so it conservatively honors all blockers on that attribute.
    Unsupported documents fall back to ordinary attribute write constraints,
    just as they fall back to the generic controls in the UI.
    """
    if envelope is None:
        return False
    try:
        document = PresentationV1.model_validate(envelope.document)
    except ValidationError:
        return False

    def binding_value(binding: str) -> AttributeValueType | None:
        spec = document.bindings.get(binding)
        return resolve(spec.attribute) if spec else None

    for button in _buttons(document.page):
        control = document.controls.get(button.action.control)
        binding = document.bindings.get(control.binding) if control else None
        if (
            binding
            and binding.attribute == attribute
            and button.blocked_when is not None
            and evaluate_condition(button.blocked_when, binding_value) is not False
        ):
            return True
    return False
