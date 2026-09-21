"""Trust, expiry, rules and write-state projection for one device.

The device owns the only value stores: ``Attribute.current_value`` and, for
value-mapped attributes, ``Attribute.raw_value``. The guard reads them through
resolvers and tracks which observations may be *trusted* for write
eligibility: a value stays displayed yet untrusted after a restart, an expiry,
a failed read or a write that was just sent.

Per observation the guard does O(1) work plus the value-mapped attributes
whose table references the observed one. The write-state projection is
computed lazily, for the attributes marked dirty, when a turn's event or a
read needs it; one ``EvaluationBudget`` of ``MAX_DEVICE_OPERATIONS`` bounds
each projection pass.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from typing import TYPE_CHECKING

from devices_manager.core.conditions import (
    EvaluationBudget,
    EvaluationContext,
    EvaluationLimitError,
    attribute_references,
)
from devices_manager.core.driver.write_validation import write_references
from devices_manager.core.utils.cast import cast
from models.errors import WriteRejectedError
from models.expressions import MAX_DEVICE_OPERATIONS
from models.types import DataType
from models.write_rules import AttributeWriteState, WriteEvaluation, WriteReason

from .freshness import observation_max_age
from .trust_expiry import TrustExpiry
from .value_mapping import decode_mapping, encode_mapping
from .write_rules import evaluate_write, project_write_state

if TYPE_CHECKING:
    from collections.abc import Callable

    from devices_manager.core.conditions import ValueResolver
    from devices_manager.core.driver import AttributeDriver, Driver
    from models.types import AttributeValueType


@dataclass(frozen=True)
class Decoded:
    """What one observation, or one reinterpreted saved code, means for an attribute."""

    value: AttributeValueType | None
    """The display value: the typed sample or the mapped semantic value."""
    code: AttributeValueType | None = None
    """The wire code of a value-mapped attribute, kept as ``Attribute.raw_value``."""
    error: WriteReason | None = None
    """Why ``value`` is ``None`` for a value-mapped attribute."""


class WriteGuard:
    """The single collaborator a device consults before, during and after writes."""

    def __init__(
        self,
        driver: Driver,
        values: ValueResolver,
        codes: ValueResolver,
        *,
        on_expired: Callable[[], None] | None = None,
    ) -> None:
        self._values = values
        self._codes = codes
        self._on_expired = on_expired
        self._expiry: TrustExpiry | None = None
        self._trusted: set[str] = set()
        self._observed_at: dict[str, float] = {}
        self._resolved: set[str] = set()
        self._states: dict[str, AttributeWriteState] = {}
        self._decoded: dict[str, Decoded] = {}
        self._dirty: set[str] = set()
        self._dirty_all = True
        self._published_changed = False
        # Seeded from the clock so a restart never replays a smaller revision
        # to clients that ignore revisions older than the one they hold.
        self._revision = time.time_ns() // 1_000_000
        self._announced = self._revision
        self._rule_dependents: dict[str, set[str]] = {}
        self._mapping_refs: dict[str, set[str]] = {}
        self._mapping_dependents: dict[str, list[str]] = {}
        self._driver = driver
        self._index(driver)

    # --- trust ------------------------------------------------------------

    def observed(
        self, name: str, sample: AttributeValueType | None
    ) -> dict[str, Decoded]:
        """One acquired sample: trust it, decode it, reinterpret what depends on it.

        Returns the display results in apply order, the observed attribute
        first; the caller stores them before consulting the guard again. A
        ``None`` sample is not an observation and only drops trust.
        """
        self.expire_if_due()
        spec = self._driver.attributes[name]
        if sample is None:
            self.forget(name)
            return {name: Decoded(None)}
        if self._expiry is not None:
            self._expiry.record_observation()
        self._trusted.add(name)
        self._observed_at[name] = time.monotonic()
        fresh: dict[str, AttributeValueType | None] = {}

        def resolve(ref: str) -> AttributeValueType | None:
            # Values decoded in this call are not stored yet: read them here,
            # but only when the attribute they belong to is trusted.
            if ref in fresh:
                return fresh[ref] if self._is_known(ref) else None
            return self.known(ref)

        budget = EvaluationBudget(MAX_DEVICE_OPERATIONS)
        decoded = (
            self._decode(spec, sample, resolve, budget)
            if spec.value_mapping is not None
            else Decoded(sample)
        )
        results = {name: decoded}
        fresh[name] = decoded.value
        self._record(spec, decoded)
        self._touch(name)
        for dependent in self._mapping_dependents.get(name, ()):
            code = self._codes(dependent)
            if code is None:
                continue
            dependent_spec = self._driver.attributes[dependent]
            reinterpreted = self._decode(dependent_spec, code, resolve, budget)
            results[dependent] = reinterpreted
            fresh[dependent] = reinterpreted.value
            self._record(dependent_spec, reinterpreted)
            self._touch(dependent)
        return results

    def forget(self, name: str | None = None) -> None:
        """Invalidate an observation after a read failure, write or device stop.

        Display history remains, but neither driver rules nor operating rules may
        rely on it until a new observation arrives.
        """
        if name is None:
            self._observed_at.clear()
        else:
            self._observed_at.pop(name, None)
        self._forget_trust(name)

    def _forget_trust(self, name: str | None = None) -> None:
        """Drop driver-rule trust without imposing its deadline on site rules."""
        if name is None:
            self._trusted.clear()
            self._resolved.clear()
            self._dirty.clear()
            self._dirty_all = True
            return
        self._trusted.discard(name)
        self._resolved.discard(name)
        self._touch(name)
        for dependent in self._mapping_dependents.get(name, ()):
            self._resolved.discard(dependent)
            self._touch(dependent)

    def known(self, name: str) -> AttributeValueType | None:
        """The trusted value of an attribute; ``None`` when it must not be relied on."""
        self.expire_if_due()
        deadline = observation_max_age(self._driver, name)
        observed_at = self._observed_at.get(name)
        if (
            deadline is not None
            and observed_at is not None
            and time.monotonic() - observed_at >= deadline
        ):
            self._forget_trust(name)
        for dependency in self._mapping_refs.get(name, ()):
            if self.known(dependency) is None:
                self._resolved.discard(name)
        return self._values(name) if self._is_known(name) else None

    def observed_value(
        self, name: str, *, max_age_seconds: float | None = None
    ) -> AttributeValueType | None:
        """Resolve acquired observations using this operating rule's own age limit.

        Driver expiry cannot erase reception times: another operating rule may allow
        older data or disable expiry. Explicit invalidation still removes them.
        Decode mapped values afresh so all mapping inputs obey the same limit,
        regardless of the driver's cached resolution or another rule's deadline.
        """
        now = time.monotonic()
        budget = EvaluationBudget(MAX_DEVICE_OPERATIONS)
        cache: dict[str, AttributeValueType | None] = {}

        def resolve(ref: str) -> AttributeValueType | None:
            budget.spend()
            if ref in cache:
                return cache[ref]
            spec = self._driver.attributes.get(ref)
            observed_at = self._observed_at.get(ref)
            if (
                spec is None
                or observed_at is None
                or (
                    max_age_seconds is not None and now - observed_at >= max_age_seconds
                )
            ):
                cache[ref] = None
            elif spec.value_mapping is None:
                cache[ref] = self._values(ref)
            else:
                code = self._codes(ref)
                cache[ref] = (
                    self._decode(spec, code, resolve, budget).value
                    if code is not None
                    else None
                )
            return cache[ref]

        try:
            return resolve(name)
        except EvaluationLimitError:
            return None

    # --- eligibility ------------------------------------------------------

    def evaluate(self, name: str, value: AttributeValueType) -> WriteEvaluation:
        """Check a typed candidate against the live contract, without side effects."""
        self.expire_if_due()
        spec = self._driver.attributes.get(name)
        if spec is None or spec.write is None:
            return WriteEvaluation(
                eligible=False, reasons=[WriteReason(code="not_writable")]
            )
        if (
            spec.data_type == DataType.INT
            and isinstance(value, float)
            and not value.is_integer()
        ):
            return WriteEvaluation(
                eligible=False, reasons=[WriteReason(code="invalid_value")]
            )
        try:
            validated = cast(value, spec.data_type)
        except (TypeError, ValueError, OverflowError):
            return WriteEvaluation(
                eligible=False, reasons=[WriteReason(code="invalid_value")]
            )
        return evaluate_write(spec, validated, self.known)

    def check(self, name: str, value: AttributeValueType) -> AttributeValueType:
        """The typed candidate when it is eligible; ``WriteRejectedError`` otherwise."""
        evaluation = self.evaluate(name, value)
        if not evaluation.eligible or evaluation.value is None:
            raise WriteRejectedError(evaluation.reasons)
        return evaluation.value

    def encode(self, name: str, value: AttributeValueType) -> AttributeValueType:
        """The wire code of a candidate, through the live per-device value table."""
        spec = self._driver.attributes[name]
        if spec.value_mapping is None:
            return value
        return encode_mapping(
            spec.value_mapping, value, EvaluationContext(self.known, candidate=value)
        )

    def mapping_context(self, name: str) -> dict[str, AttributeValueType | None]:
        """The trusted values a value table reads, to detect a context that moved."""
        return {
            ref: self.known(ref) for ref in sorted(self._mapping_refs.get(name, ()))
        }

    # --- projection -------------------------------------------------------

    def project(self) -> dict[str, AttributeWriteState]:
        """Recompute the write states marked dirty; returns only those that changed.

        The revision moves once per pass when a published slot changed:
        a write state, a raw code or a resolution error.
        """
        self.expire_if_due()
        for name in tuple(self._trusted):
            self.known(name)
        if not (self._dirty_all or self._dirty or self._published_changed):
            return {}
        names = list(self._driver.attributes) if self._dirty_all else list(self._dirty)
        budget = EvaluationBudget(MAX_DEVICE_OPERATIONS)
        changed: dict[str, AttributeWriteState] = {}
        for name in names:
            spec = self._driver.attributes.get(name)
            if spec is None:
                continue
            state = project_write_state(spec, self.known, budget=budget)
            if self._states.get(name) != state:
                self._states[name] = state
                changed[name] = state
        moved = bool(changed) or self._published_changed
        self._dirty.clear()
        self._dirty_all = False
        self._published_changed = False
        if moved:
            self._revision += 1
        return changed

    def state(self, name: str) -> AttributeWriteState | None:
        self.project()
        return self._states.get(name)

    @property
    def revision(self) -> int:
        return self._revision

    def announce(self) -> bool:
        """Whether the revision moved since the last announcement, and mark it."""
        if self._revision == self._announced:
            return False
        self._announced = self._revision
        return True

    # --- lifecycle --------------------------------------------------------

    def rebind(self, driver: Driver) -> None:
        """Follow a committed change of the driver: new indexes, no stale names."""
        self._driver = driver
        self._index(driver)
        names = driver.attributes.keys()
        self._trusted &= names
        self._resolved &= names
        self._observed_at = {
            name: observed_at
            for name, observed_at in self._observed_at.items()
            if name in names
        }
        for cache in (self._states, self._decoded):
            for stale in [name for name in cache if name not in names]:
                del cache[stale]
        self._dirty.clear()
        self._dirty_all = True

    def rename(self, old: str, new: str) -> None:
        """Move trust and caches along with a renamed attribute, then rebind."""
        for names in (self._trusted, self._resolved):
            if old in names:
                names.discard(old)
                names.add(new)
        for cache in (self._states, self._decoded):
            if old in cache:
                cache[new] = cache.pop(old)  # type: ignore[assignment]
        if old in self._observed_at:
            self._observed_at[new] = self._observed_at.pop(old)
        self.rebind(self._driver)

    def watch(self, interval: float | None) -> None:
        """Bound trust to one expected push interval on the running loop's clock."""
        if self._expiry is not None:
            self._expiry.close()
            self._expiry = None
        if interval is None:
            return
        self._expiry = TrustExpiry(
            interval, self._expire, now=asyncio.get_running_loop().time
        )
        self._expiry.watch()

    def close(self) -> None:
        """Stop bounding trust and drop it: a stopped device knows nothing."""
        if self._expiry is not None:
            self._expiry.close()
            self._expiry = None
        self.forget()

    def expire_if_due(self) -> None:
        """Enforce the trust deadline now, even when the event loop runs late."""
        if self._expiry is not None:
            self._expiry.expire_if_due()

    # --- internals --------------------------------------------------------

    def _expire(self) -> None:
        self._forget_trust()
        if self._on_expired is not None:
            self._on_expired()

    def _is_known(self, name: str) -> bool:
        if name not in self._trusted:
            return False
        spec = self._driver.attributes.get(name)
        if spec is None:
            return False
        return spec.value_mapping is None or name in self._resolved

    def _touch(self, name: str) -> None:
        """Mark the attributes whose write state reads ``name`` for re-projection."""
        if not self._dirty_all:
            self._dirty.update(self._rule_dependents.get(name, ()))

    def _record(self, spec: AttributeDriver, decoded: Decoded) -> None:
        if spec.value_mapping is None:
            return
        if decoded.error is None:
            self._resolved.add(spec.name)
        else:
            self._resolved.discard(spec.name)
        if self._decoded.get(spec.name) != decoded:
            self._published_changed = True
        self._decoded[spec.name] = decoded

    def _decode(
        self,
        spec: AttributeDriver,
        code: AttributeValueType,
        resolve: ValueResolver,
        budget: EvaluationBudget,
    ) -> Decoded:
        """Resolve a wire code through the value table, keeping failures explicit."""
        mapping = spec.value_mapping
        if mapping is None:  # pragma: no cover - callers check first
            return Decoded(code)
        try:
            value = decode_mapping(
                mapping,
                code,
                EvaluationContext(resolve, budget=EvaluationBudget(parent=budget)),
            )
            if (
                spec.data_type == DataType.INT
                and isinstance(value, float)
                and not value.is_integer()
            ):
                return Decoded(None, code, WriteReason(code="invalid_mapping_value"))
            return Decoded(cast(value, spec.data_type), code)
        except WriteRejectedError as exc:
            return Decoded(None, code, exc.reasons[0])
        except EvaluationLimitError:
            return Decoded(None, code, WriteReason(code="evaluation_limit"))
        except (ValueError, TypeError, OverflowError):
            return Decoded(None, code, WriteReason(code="invalid_mapping_value"))

    def _index(self, driver: Driver) -> None:
        """Compile the reference indexes once per driver edit, never per sample."""
        self._rule_dependents = {}
        self._mapping_refs = {}
        for name, spec in driver.attributes.items():
            for ref in write_references(spec):
                self._rule_dependents.setdefault(ref, set()).add(name)
            if spec.value_mapping is not None:
                self._mapping_refs[name] = attribute_references(spec.value_mapping)
        self._mapping_dependents = _transitive_dependents(
            self._mapping_refs, _mapping_order(self._mapping_refs)
        )


def _mapping_order(refs: dict[str, set[str]]) -> list[str]:
    """Value-mapped attributes ordered so every table's references come first."""
    pending = dict(refs)
    order: list[str] = []
    while pending:
        ready = [name for name, deps in pending.items() if not deps & pending.keys()]
        if not ready:
            msg = "Invalid mapping dependency cycle"
            raise ValueError(msg)
        order.extend(ready)
        for name in ready:
            del pending[name]
    return order


def _transitive_dependents(
    refs: dict[str, set[str]], order: list[str]
) -> dict[str, list[str]]:
    """For each attribute, the value-mapped attributes to reinterpret when it moves."""
    rank = {name: position for position, name in enumerate(order)}
    direct: dict[str, set[str]] = {}
    for mapped, deps in refs.items():
        for ref in deps:
            direct.setdefault(ref, set()).add(mapped)
    dependents: dict[str, list[str]] = {}
    for name, first in direct.items():
        reached: set[str] = set()
        stack = list(first)
        while stack:
            mapped = stack.pop()
            if mapped in reached:
                continue
            reached.add(mapped)
            stack.extend(direct.get(mapped, ()))
        dependents[name] = sorted(reached, key=rank.__getitem__)
    return dependents
