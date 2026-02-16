import contextlib
import logging
from asyncio import CancelledError, Task, create_task
from collections.abc import Awaitable, Callable, Coroutine
from typing import Any

logger = logging.getLogger(__name__)
DMTaskKey = tuple[str, ...]


class TasksRegistry:
    _registry: dict[DMTaskKey, Task]

    def __init__(self) -> None:
        self._registry = {}

    def add(
        self,
        key: DMTaskKey,
        coro: Coroutine[Any, Any, Any] | Callable[[], Awaitable[Any]],
    ) -> None:
        """Add a new task to the registry."""
        if key in self._registry:
            msg = f"Task with key {key} already exists."
            raise ValueError(msg)
        task = create_task(coro) if isinstance(coro, Coroutine) else create_task(coro())
        logger.info("Task %s added to registry.", key)
        self._registry[key] = task

    def get(self, key: DMTaskKey) -> Task | None:
        """Retrieve a task by its key."""
        return self._registry.get(key)

    def __len__(self) -> int:
        return len(self._registry)

    def has(self, key: DMTaskKey) -> bool:
        """Check if a task exists in the registry."""
        return key in self._registry

    async def remove(self, key: DMTaskKey) -> bool:
        """Cancel and remove a task from the registry."""
        if key not in self._registry:
            return False

        task = self._registry.pop(key)
        task.cancel()
        with contextlib.suppress(CancelledError):
            await task
        return True

    async def shutdown(self) -> None:
        """Cancel and remove all tasks in the registry."""
        for key in list(self._registry.keys()):
            await self.remove(key)
