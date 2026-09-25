"""Write evaluation and UI projections share one attribute contract."""

from __future__ import annotations

from typing import TYPE_CHECKING

from models.conditions import (
    EvaluationBudget,
    EvaluationContext,
    EvaluationLimitError,
    is_number,
    scalar_equal,
    uses_candidate,
)
from models.errors import WriteRejectedError
from models.types import DataType
from models.write_rules import (
    AttributeWriteState,
    ResolvedOption,
    WriteEvaluation,
    WriteReason,
)

from .value_mapping import encode_mapping, project_mapping
from .write_constraints import check_write_constraints, preview_write_constraints

if TYPE_CHECKING:
    from devices_manager.core.driver.attribute_driver import AttributeDriver
    from models.conditions import ValueResolver
    from models.types import AttributeValueType


def _options(spec: AttributeDriver) -> list[AttributeValueType] | None:
    if spec.write_options is not None:
        return [option.value for option in spec.write_options]
    return [False, True] if spec.data_type == DataType.BOOL else spec.value_options


def support_reason(
    spec: AttributeDriver, context: EvaluationContext
) -> WriteReason | None:
    """A missing capability observation is unknown, never proof of no support."""
    if spec.supported_when is None:
        return None
    supported = context.condition(spec.supported_when)
    if supported is True:
        return None
    return WriteReason(
        code="support_unknown" if supported is None else "unsupported_attribute"
    )


def _check_options(
    spec: AttributeDriver,
    value: AttributeValueType,
    context: EvaluationContext,
    *,
    mapping_checked: bool = False,
) -> None:
    if spec.write_options is not None:
        option = next(
            (o for o in spec.write_options if scalar_equal(o.value, value)), None
        )
        if option is None:
            raise WriteRejectedError([WriteReason(code="invalid_option")])
        if option.allowed_when:
            allowed = context.condition(option.allowed_when)
            if allowed is None:
                raise WriteRejectedError([WriteReason(code="unknown_dependencies")])
            if allowed is False:
                raise WriteRejectedError(
                    [option.reason or WriteReason(code="option_unavailable")]
                )
    elif not spec.value_mapping and spec.value_options is not None:
        if not any(scalar_equal(value, option) for option in spec.value_options):
            raise WriteRejectedError([WriteReason(code="invalid_option")])
    if spec.value_mapping and not mapping_checked:
        encode_mapping(spec.value_mapping, value, context)


def evaluate_write(
    spec: AttributeDriver,
    value: AttributeValueType,
    resolve: ValueResolver,
    *,
    context: EvaluationContext | None = None,
    mapping_checked: bool = False,
) -> WriteEvaluation:
    """Check the typed candidate without changing device state or doing I/O."""
    valid = {
        DataType.BOOL: isinstance(value, bool),
        DataType.STRING: isinstance(value, str),
        DataType.FLOAT: is_number(value),
        DataType.INT: is_number(value)
        and (not isinstance(value, float) or value.is_integer()),
    }
    if not valid[spec.data_type]:
        return WriteEvaluation(
            eligible=False, reasons=[WriteReason(code="invalid_value")]
        )
    result = WriteEvaluation(eligible=False, value=value)
    context = context or EvaluationContext(resolve, candidate=value)
    try:
        reason = support_reason(spec, context)
    except EvaluationLimitError:
        reason = WriteReason(code="evaluation_limit")
    if reason is not None:
        result.reasons.append(reason)
        return result
    if spec.write is None:
        result.reasons.append(WriteReason(code="not_writable"))
        return result
    try:
        check_write_constraints(spec, value, resolve, context=context)
        _check_options(spec, value, context, mapping_checked=mapping_checked)
        _evaluate_rules(spec, context, result)
    except WriteRejectedError as exc:
        result.reasons.extend(exc.reasons)
    except EvaluationLimitError:
        result.reasons.append(WriteReason(code="evaluation_limit"))
    result.eligible = not result.reasons
    return result


def _evaluate_rules(
    spec: AttributeDriver,
    context: EvaluationContext,
    result: WriteEvaluation,
    *,
    projecting: bool = False,
) -> None:
    for rule in spec.write_rules:
        if projecting and uses_candidate(rule.condition):
            continue
        outcome = context.condition(rule.condition)
        if rule.effect == "warn":
            if outcome is not False:
                result.warnings.append(rule.reason)
        elif outcome is None:
            result.reasons.append(WriteReason(code="unknown_dependencies"))
        elif outcome is False:
            result.reasons.append(rule.reason)


def project_write_state(
    spec: AttributeDriver,
    resolve: ValueResolver,
    *,
    budget: EvaluationBudget | None = None,
) -> AttributeWriteState:
    """Project options and limits from observations; free candidates use previews."""
    result = AttributeWriteState()
    context = EvaluationContext(resolve, budget=EvaluationBudget(parent=budget))
    try:
        reason = support_reason(spec, context)
    except EvaluationLimitError:
        reason = WriteReason(code="evaluation_limit")
    if reason is not None:
        unknown = reason.code in {"support_unknown", "evaluation_limit"}
        result.support = "unknown" if unknown else "unsupported"
        result.status = "unknown" if unknown else "blocked"
        result.missing_dependencies = unknown
        result.reasons = [reason]
        result.missing_attributes = sorted(context.missing)
        return result
    if spec.write is None:
        result.status = "blocked"
        result.reasons = [WriteReason(code="not_writable")]
        return result
    try:
        result.constraints = preview_write_constraints(spec, resolve, context=context)
        result.options = _project_options(spec, context)
        evaluation = WriteEvaluation(eligible=True)
        _evaluate_rules(spec, context, evaluation, projecting=True)
        refused = any(r.code != "unknown_dependencies" for r in evaluation.reasons)
        result.reasons = evaluation.reasons
        result.warnings = evaluation.warnings
        result.candidate_required = any(
            uses_candidate(rule.condition) for rule in spec.write_rules
        )
        if result.options is not None and not any(
            option.available for option in result.options
        ):
            result.reasons.append(WriteReason(code="no_available_options"))
        if result.constraints and result.constraints.unknown:
            result.missing_dependencies = True
            # Sentinels bypass numeric bounds; their eligibility is still previewed.
            if not result.constraints.sentinels and result.options is None:
                result.reasons.append(WriteReason(code="unknown_dependencies"))
        result.missing_dependencies |= any(
            reason.code == "unknown_dependencies"
            for reason in result.reasons
            + [r for option in result.options or [] for r in option.reasons]
        )
        if result.reasons:
            result.status = (
                "unknown" if result.missing_dependencies and not refused else "blocked"
            )
    except EvaluationLimitError:
        result.status = "blocked"
        result.reasons = [WriteReason(code="evaluation_limit")]
    result.missing_attributes = sorted(context.missing)
    result.missing_dependencies |= bool(context.missing)
    return result


def _project_options(
    spec: AttributeDriver, context: EvaluationContext
) -> list[ResolvedOption] | None:
    mapped = (
        project_mapping(spec.value_mapping, context) if spec.value_mapping else None
    )
    options = (
        [option.value for option in mapped]
        if mapped is not None and spec.write_options is None
        else _options(spec)
    )
    if options is None:
        return None
    result = []
    for value in options:
        candidate = EvaluationContext(
            context.resolve, candidate=value, budget=context.budget
        )
        evaluation = evaluate_write(
            spec,
            value,
            context.resolve,
            context=candidate,
            mapping_checked=mapped is not None,
        )
        context.missing.update(candidate.missing)
        if mapped is not None:
            mapping_option = next(
                (option for option in mapped if scalar_equal(option.value, value)), None
            )
            evaluation.reasons.extend(
                mapping_option.reasons
                if mapping_option
                else [WriteReason(code="unavailable_mapping")]
            )
        result.append(
            ResolvedOption(
                value=value,
                available=not evaluation.reasons,
                reasons=evaluation.reasons,
            )
        )
    return result
