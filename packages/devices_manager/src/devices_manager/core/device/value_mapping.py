"""Instance-local resolution above the codec pipeline; no transport side effects."""

from __future__ import annotations

from typing import TYPE_CHECKING

from models.conditions import scalar_equal, scalar_key
from models.errors import WriteRejectedError
from models.write_rules import ResolvedOption, WriteReason

if TYPE_CHECKING:
    from collections.abc import Sequence

    from models.conditions import EvaluationContext
    from models.types import AttributeValueType
    from models.write_rules import ValueMapping


def _refuse(code: str) -> None:
    raise WriteRejectedError([WriteReason(code=code)])


def decode_mapping(
    mapping: ValueMapping, code: AttributeValueType, context: EvaluationContext
) -> AttributeValueType:
    """Reserved/nonselectable codes remain observable; only encoding excludes them."""
    for entry in mapping.entries:
        context.spend(0)
        if scalar_equal(entry.code, code):
            value = context.value(entry.value)
            if value is None:
                _refuse("unknown_dependencies")
            return value  # type: ignore[return-value]
    _refuse("invalid_mapping_code")
    raise AssertionError


def encode_mapping(
    mapping: ValueMapping, value: AttributeValueType, context: EvaluationContext
) -> AttributeValueType:
    """Resolve a candidate deterministically, refusing an uncertain inverse.

    A missing earlier entry can hide a terminator or the first occurrence.
    In reject mode a missing later entry can hide a duplicate as well.
    """
    matches: list[AttributeValueType] = []
    unknown = False
    for entry in mapping.entries:
        context.spend(0)
        resolved = context.value(entry.value)
        if resolved is None:
            unknown |= entry.selectable or mapping.stop_value is not None
            continue
        if mapping.stop_value is not None and scalar_equal(
            resolved, mapping.stop_value
        ):
            break
        if entry.selectable and scalar_equal(resolved, value):
            matches.append(entry.code)
            if mapping.duplicates == "first":
                if unknown:
                    _refuse("unknown_dependencies")
                return entry.code
    if unknown:
        _refuse("unknown_dependencies")
    if len(matches) > 1:
        _refuse("ambiguous_mapping")
    if not matches:
        _refuse("unavailable_mapping")
    return matches[0]


def project_mapping(
    mapping: ValueMapping,
    context: EvaluationContext,
    values: Sequence[AttributeValueType] = (),
) -> dict[tuple[bool, AttributeValueType], ResolvedOption]:
    """Resolve the table once, then index candidate eligibility by `scalar_key`.

    Unknown entries before a terminator can hide an earlier match or a duplicate.
    Values beyond it, and given values it never resolves, remain visible with
    the reason encoding would give, but cannot be encoded.
    """
    options = {
        scalar_key(value): ResolvedOption(value=value, available=False)
        for value in values
    }
    counts: dict[tuple[bool, AttributeValueType], int] = {}
    first_unknown: dict[tuple[bool, AttributeValueType], bool] = {}
    stopped = unknown = False
    for entry in mapping.entries:
        value = context.value(entry.value)
        if value is None:
            if not stopped:
                unknown |= entry.selectable or mapping.stop_value is not None
            continue
        if mapping.stop_value is not None and scalar_equal(value, mapping.stop_value):
            stopped = True
            continue
        key = scalar_key(value)
        options.setdefault(key, ResolvedOption(value=value, available=False))
        if entry.selectable and not stopped:
            counts[key] = counts.get(key, 0) + 1
            first_unknown.setdefault(key, unknown)
    for key, option in options.items():
        count = counts.get(key, 0)
        uncertain = (
            first_unknown.get(key, unknown)
            if mapping.duplicates == "first"
            else unknown
        )
        if uncertain:
            option.reasons = [WriteReason(code="unknown_dependencies")]
        elif count > 1 and mapping.duplicates == "reject":
            option.reasons = [WriteReason(code="ambiguous_mapping")]
        elif not count:
            option.reasons = [WriteReason(code="unavailable_mapping")]
        else:
            option.available = True
    return options
