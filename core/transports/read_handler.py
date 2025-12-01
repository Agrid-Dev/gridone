import contextlib
from collections.abc import Callable
from typing import Any

type ReadHandler = Callable[[Any], None]


class ReadHandlerRegistry:
    _registry: dict[str, ReadHandler]

    def __init__(self) -> None:
        self._registry = {}

    def add(self, key: str, handler: ReadHandler) -> None:
        self._registry[key] = handler  # overwrite for now

    def remove(self, key: str) -> None:
        with contextlib.suppress(KeyError):
            del self._registry[key]

    def get(self, key: str) -> ReadHandler | None:
        try:
            return self._registry[key]
        except KeyError:
            return None
