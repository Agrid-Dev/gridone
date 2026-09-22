from __future__ import annotations

from typing import TYPE_CHECKING

from models.errors import ConflictError

if TYPE_CHECKING:
    from models.operating_rules import OperatingRule


class MemoryStorage:
    def __init__(self) -> None:
        self._revisions: dict[str, list[OperatingRule]] = {}

    async def list_operating_rules(self) -> list[OperatingRule]:
        return [rows[-1].model_copy(deep=True) for rows in self._revisions.values()]

    async def save(self, operating_rule: OperatingRule) -> OperatingRule:
        rows = self._revisions.setdefault(operating_rule.id, [])
        if operating_rule.revision != len(rows) + 1:
            msg = "OperatingRule changed; reload before editing"
            raise ConflictError(msg)
        rows.append(operating_rule.model_copy(deep=True))
        return operating_rule.model_copy(deep=True)

    async def history(self, operating_rule_id: str) -> list[OperatingRule]:
        return [
            row.model_copy(deep=True)
            for row in self._revisions.get(operating_rule_id, [])
        ]

    async def close(self) -> None:
        pass
