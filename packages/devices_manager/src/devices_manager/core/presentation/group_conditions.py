"""Conservative per-member control gating for absolute group commands."""

from __future__ import annotations

from typing import TYPE_CHECKING

from pydantic import ValidationError

from .capabilities import DOCUMENT_BUDGETS
from .models import (
    AllCondition,
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


def evaluate_condition(  # noqa: PLR0911 -- each condition operator has its own result
    condition: Condition, resolve: ValueResolver, *, depth: int = 1
) -> bool | None:
    """Evaluate validated conditions with Kleene logic; unknown never grants access.

    Documents already enforce the operation budget on ingestion. Depth remains
    bounded here as well. Booleans and numbers compare as distinct scalar types,
    matching the presentation renderer's strict equality.
    """
    if depth > DOCUMENT_BUDGETS.max_condition_depth:
        return None
    if isinstance(condition, IsKnownCondition):
        return resolve(condition.binding) is not None
    if isinstance(condition, EqCondition | InCondition):
        value = resolve(condition.binding)
        if value is None:
            return None
        options = (
            [condition.value]
            if isinstance(condition, EqCondition)
            else condition.values
        )
        return any(
            value == option and isinstance(value, bool) == isinstance(option, bool)
            for option in options
        )
    if isinstance(condition, NotCondition):
        value = evaluate_condition(condition.condition, resolve, depth=depth + 1)
        return None if value is None else not value
    values = [
        evaluate_condition(child, resolve, depth=depth + 1)
        for child in condition.conditions
    ]
    if isinstance(condition, AllCondition):
        return False if False in values else None if None in values else True
    return True if True in values else None if None in values else False


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
