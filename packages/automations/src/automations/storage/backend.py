from __future__ import annotations

from typing import TYPE_CHECKING, Protocol

if TYPE_CHECKING:
    from automations.models import Automation, AutomationExecution


class AutomationsStorageBackend(Protocol):
    async def create(self, automation: Automation) -> None: ...

    async def get(self, automation_id: str) -> Automation: ...

    # raises NotFoundError when id is absent

    async def list(self, *, enabled: bool | None = None) -> list[Automation]: ...  # type: ignore[invalid-type-form]

    async def update(self, automation: Automation) -> None: ...

    # raises NotFoundError when id is absent

    async def delete(self, automation_id: str) -> None: ...

    # raises NotFoundError when id is absent

    async def delete_executions(self, automation_id: str) -> None: ...

    # deletes all executions for the given automation (service-level cascade)

    async def log_execution(self, execution: AutomationExecution) -> None: ...

    async def list_executions(
        self, automation_id: str
    ) -> list[AutomationExecution]: ...  # type: ignore[invalid-type-form]

    # returns newest-first

    async def start(self) -> None: ...

    # runs pending migrations

    async def close(self) -> None: ...
