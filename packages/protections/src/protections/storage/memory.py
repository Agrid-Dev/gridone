from __future__ import annotations

from typing import TYPE_CHECKING

from models.errors import ConflictError

if TYPE_CHECKING:
    from models.protections import Protection


class MemoryStorage:
    def __init__(self) -> None:
        self._revisions: dict[str, list[Protection]] = {}

    async def list_protections(self) -> list[Protection]:
        return [rows[-1].model_copy(deep=True) for rows in self._revisions.values()]

    async def save(self, protection: Protection) -> Protection:
        rows = self._revisions.setdefault(protection.id, [])
        if protection.revision != len(rows) + 1:
            msg = "Protection changed; reload before editing"
            raise ConflictError(msg)
        rows.append(protection.model_copy(deep=True))
        return protection.model_copy(deep=True)

    async def history(self, protection_id: str) -> list[Protection]:
        return [
            row.model_copy(deep=True) for row in self._revisions.get(protection_id, [])
        ]

    async def close(self) -> None:
        pass
