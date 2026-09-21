"""Deployment-owned operating rules with audited configuration and live diagnostics."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from models.errors import (
    ConflictError,
    NotFoundError,
    StorageConnectionError,
    StorageNotInitializedError,
    WriteRejectedError,
)
from models.expression_validation import validate_expression
from models.expressions import MAX_RULES, DevicePointRef
from models.ids import gen_id
from models.operating_rules import (
    OperatingRule,
    OperatingRuleDefinition,
    OperatingRuleRetirement,
    OperatingRuleView,
    PointContract,
    operating_rule_points,
)
from models.types import DataType
from models.write_rules import WriteReason

from .storage import build_storage

if TYPE_CHECKING:
    from models.operating_rules import PointInspector

    from .storage.protocol import OperatingRulesStorage

_TYPES = {
    DataType.INT: "number",
    DataType.FLOAT: "number",
    DataType.BOOL: "bool",
    DataType.STRING: "str",
}


class OperatingRulesService:
    def __init__(self, storage_url: str | None, inspect_point: PointInspector) -> None:
        self._storage_url = storage_url
        self._inspect = inspect_point
        self._storage: OperatingRulesStorage | None = None
        self._rules: dict[str, OperatingRule] = {}
        self._lock = asyncio.Lock()

    async def start(self) -> None:
        if self._storage is not None:
            return
        storage = await build_storage(self._storage_url)
        try:
            rules = await storage.list_operating_rules()
        except BaseException as exc:
            await storage.close()
            if isinstance(exc, Exception):
                msg = "Failed to load operating rules"
                raise StorageConnectionError(msg) from exc
            raise
        self._rules = {rule.id: rule for rule in rules}
        self._storage = storage

    async def stop(self) -> None:
        if self._storage is not None:
            await self._storage.close()
            self._storage = None

    @property
    def storage(self) -> OperatingRulesStorage:
        if self._storage is None:
            msg = "OperatingRules service is not started"
            raise StorageNotInitializedError(msg)
        return self._storage

    def for_target(self, device_id: str, attribute: str) -> list[OperatingRule]:
        # A stopped/uninitialized provider must fail closed, never look empty.
        _ = self.storage
        return [
            rule.model_copy(deep=True)
            for rule in self._rules.values()
            if rule.retirement is None
            and rule.target.device_id == device_id
            and rule.target.attribute == attribute
        ]

    def get(self, operating_rule_id: str) -> OperatingRule:
        _ = self.storage
        rule = self._rules.get(operating_rule_id)
        if rule is None:
            msg = "OperatingRule not found"
            raise NotFoundError(msg)
        return rule.model_copy(deep=True)

    def list_operating_rules(
        self, device_id: str | None = None
    ) -> list[OperatingRuleView]:
        _ = self.storage
        return [
            OperatingRuleView(
                operating_rule=rule.model_copy(deep=True), reasons=self.diagnose(rule)
            )
            for rule in self._rules.values()
            if device_id is None or rule.target.device_id == device_id
        ]

    def diagnose(self, rule: OperatingRule) -> list[WriteReason]:
        """Retain broken rules and report target/dependency drift explicitly."""
        for point in rule.points:
            definition = self._inspect(point)
            is_target = (point.device_id, point.attribute) == (
                rule.target.device_id,
                rule.target.attribute,
            )
            if (
                definition is None
                or definition.data_type != point.data_type
                or (is_target and not definition.writable)
            ):
                return [
                    WriteReason(
                        code="operating_rule_reference_invalid",
                        operating_rule_id=rule.id,
                        operating_rule_explanation=rule.explanation,
                    )
                ]
        return []

    def _validate(
        self, definition: OperatingRuleDefinition, replacing: str | None = None
    ) -> list[PointContract]:
        """Validate the destination, referenced points and shared expression types."""
        if (
            len(
                [
                    rule
                    for rule in self.for_target(
                        definition.target.device_id, definition.target.attribute
                    )
                    if rule.id != replacing
                ]
            )
            >= MAX_RULES
        ):
            raise WriteRejectedError([WriteReason(code="evaluation_limit")])
        target = DevicePointRef(
            device_id=definition.target.device_id, attribute=definition.target.attribute
        )
        references = operating_rule_points(definition)
        points = list(dict.fromkeys([target, *references]))
        contracts = []
        types: dict[str | DevicePointRef, str] = {}
        for point in points:
            info = self._inspect(point)
            if info is None:
                raise WriteRejectedError(
                    [WriteReason(code="operating_rule_reference_invalid")]
                )
            if point == target and not info.writable:
                raise WriteRejectedError([WriteReason(code="not_writable")])
            if (
                point == target
                and info.data_type == DataType.INT
                and isinstance(definition.target.value, float)
                and not definition.target.value.is_integer()
            ):
                raise WriteRejectedError([WriteReason(code="invalid_value")])
            contracts.append(
                PointContract(**point.model_dump(), data_type=info.data_type)
            )
            types[point] = _TYPES[info.data_type]
        value_type = (
            "bool"
            if isinstance(definition.target.value, bool)
            else "number"
            if isinstance(definition.target.value, int | float)
            else "str"
        )
        if value_type != types[target]:
            raise WriteRejectedError([WriteReason(code="invalid_value")])
        validate_expression(definition.condition, types, types[target], "condition")
        return contracts

    async def create(
        self, definition: OperatingRuleDefinition, actor_id: str
    ) -> OperatingRule:
        async with self._lock:
            points = self._validate(definition)
            now = datetime.now(UTC)
            rule = OperatingRule(
                **definition.model_dump(),
                id=gen_id(),
                points=points,
                created_at=now,
                updated_at=now,
                created_by=actor_id,
                updated_by=actor_id,
            )
            return await self._save(rule)

    async def update(
        self,
        operating_rule_id: str,
        definition: OperatingRuleDefinition,
        actor_id: str,
        revision: int,
    ) -> OperatingRule:
        async with self._lock:
            old = self._editable(operating_rule_id, revision)
            points = self._validate(definition, operating_rule_id)
            rule = OperatingRule.model_validate(
                {
                    **old.model_dump(),
                    **definition.model_dump(),
                    "points": points,
                    "revision": old.revision + 1,
                    "updated_at": datetime.now(UTC),
                    "updated_by": actor_id,
                }
            )
            return await self._save(rule)

    async def retire(
        self, operating_rule_id: str, retirement: OperatingRuleRetirement, revision: int
    ) -> OperatingRule:
        async with self._lock:
            old = self._editable(operating_rule_id, revision)
            return await self._save(
                old.model_copy(
                    update={
                        "retirement": retirement,
                        "revision": old.revision + 1,
                        "updated_at": retirement.retired_at,
                        "updated_by": retirement.actor_id,
                    }
                )
            )

    def _editable(self, operating_rule_id: str, revision: int) -> OperatingRule:
        old = self.get(operating_rule_id)
        if old.retirement is not None or old.revision != revision:
            msg = "OperatingRule changed or retired; reload before editing"
            raise ConflictError(msg)
        return old

    async def _save(self, rule: OperatingRule) -> OperatingRule:
        saved = await self.storage.save(rule)
        self._rules[saved.id] = saved.model_copy(deep=True)
        return saved

    async def history(self, operating_rule_id: str) -> list[OperatingRule]:
        self.get(operating_rule_id)
        return await self.storage.history(operating_rule_id)
