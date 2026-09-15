"""Observed command context, separate from persisted/displayed telemetry."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from devices_manager.core.conditions import (
    EvaluationBudget,
    EvaluationContext,
    EvaluationLimitError,
    attribute_references,
)
from devices_manager.core.driver.command_validation import command_references
from devices_manager.core.utils.cast import cast
from models.command_rules import CommandRejectedError, WriteReason
from models.expressions import MAX_DEVICE_OPERATIONS
from models.types import DataType

from .value_mapping import decode_mapping

if TYPE_CHECKING:
    from devices_manager.core.driver import Driver
    from models.types import AttributeValueType


@dataclass
class CommandRuntime:
    driver: Driver
    values: dict[str, AttributeValueType] = field(default_factory=dict)
    raw_values: dict[str, AttributeValueType] = field(default_factory=dict)
    resolution_errors: dict[str, WriteReason] = field(default_factory=dict)
    revision: int = 0
    dependents: dict[str, set[str]] = field(init=False, default_factory=dict)
    mapping_order: list[str] = field(init=False, default_factory=list)

    def __post_init__(self) -> None:
        self.rebuild_index()

    def rebuild_index(self) -> None:
        """Compile reference indexes once per driver edit, rather than per sample."""
        self.dependents = {}
        pending = {}
        for name, spec in self.driver.attributes.items():
            for ref in command_references(spec):
                self.dependents.setdefault(ref, set()).add(name)
            if spec.value_mapping:
                pending[name] = attribute_references(spec.value_mapping)
        self.mapping_order = []
        while pending:
            ready = [
                name for name, refs in pending.items() if not refs & pending.keys()
            ]
            if not ready:
                msg = "Invalid mapping dependency cycle"
                raise ValueError(msg)
            for name in ready:
                self.mapping_order.append(name)
                del pending[name]

    def affected(self, names: set[str]) -> set[str]:
        return names | set().union(
            *(self.dependents.get(name, set()) for name in names)
        )

    def known(self, name: str) -> AttributeValueType | None:
        return self.values.get(name)

    def invalidate(self, names: set[str] | None = None) -> None:
        """Discard trust without erasing last reported values from the device DTO."""
        targets = (
            names if names is not None else set(self.values) | set(self.raw_values)
        )
        for name in targets:
            self.values.pop(name, None)
            self.raw_values.pop(name, None)
        self._resolve_mappings()
        self.revision += 1

    def ingest(
        self, name: str, raw: AttributeValueType | None
    ) -> dict[str, AttributeValueType | None]:
        """Recompute mappings in dependency order, even if only the table changed."""
        before = dict(self.values)
        if raw is None:
            self.raw_values.pop(name, None)
            self.values.pop(name, None)
        else:
            self.raw_values[name] = raw
            if not self.driver.attributes[name].value_mapping:
                self.values[name] = raw
        self._resolve_mappings()
        if self.values != before:
            self.revision += 1
        changed = {name} | {
            key
            for key in set(before) | set(self.values)
            if before.get(key) != self.values.get(key)
        }
        return {key: self.values.get(key) for key in changed}

    def mapping_context(self, name: str) -> dict[str, AttributeValueType | None]:
        return {
            ref: self.known(ref)
            for ref in attribute_references(self.driver.attributes[name].value_mapping)
        }

    def _resolve_mappings(self) -> None:
        """Resolve the validated mapping DAG, keeping failures explicit."""
        budget = EvaluationBudget(MAX_DEVICE_OPERATIONS)
        for name in self.mapping_order:
            mapping = self.driver.attributes[name].value_mapping
            if mapping is None:
                continue
            raw = self.raw_values.get(name)
            if raw is None:
                self.values.pop(name, None)
                self.resolution_errors[name] = WriteReason(code="unknown_dependencies")
                continue
            try:
                value = decode_mapping(
                    mapping,
                    raw,
                    EvaluationContext(
                        self.known, budget=EvaluationBudget(parent=budget)
                    ),
                )
                data_type = self.driver.attributes[name].data_type
                if (
                    data_type == DataType.INT
                    and isinstance(value, float)
                    and not value.is_integer()
                ):
                    self.values.pop(name, None)
                    self.resolution_errors[name] = WriteReason(
                        code="invalid_mapping_value"
                    )
                    continue
                self.values[name] = cast(value, data_type)
            except CommandRejectedError as exc:
                self.values.pop(name, None)
                self.resolution_errors[name] = exc.reasons[0]
            except EvaluationLimitError:
                self.values.pop(name, None)
                self.resolution_errors[name] = WriteReason(code="evaluation_limit")
            except (ValueError, TypeError, OverflowError):
                self.values.pop(name, None)
                self.resolution_errors[name] = WriteReason(code="invalid_mapping_value")
            else:
                self.resolution_errors.pop(name, None)
