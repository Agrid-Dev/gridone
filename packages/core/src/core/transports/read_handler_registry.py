import contextlib
import uuid
from collections import defaultdict
from collections.abc import Callable
from typing import Any

type ReadHandler = Callable[[Any], None]  # argument is the raw response from transport


def generate_id() -> str:
    return uuid.uuid4().hex[:16]


class ReadHandlerRegistry:
    _handlers: dict[str, ReadHandler]
    _mapping_by_address: dict[str, set[str]]  # address_id: {handler_ids}

    def __init__(self) -> None:
        self._handlers = {}
        self._mapping_by_address = defaultdict(set)

    def register(self, address_id: str, handler: ReadHandler) -> str:
        handler_id = generate_id()
        self._handlers[handler_id] = handler
        self._mapping_by_address[address_id].add(handler_id)
        return handler_id

    def remove(self, handler_id: str, address_id: str | None = None) -> None:
        """Removes a handler from the registry.
        Does not throw if handler does not exist."""
        with contextlib.suppress(KeyError):
            del self._handlers[handler_id]
        if address_id is not None:
            self._mapping_by_address[address_id].remove(handler_id)
        else:
            for address, handler_ids in self._mapping_by_address.items():
                if handler_id in handler_ids:
                    self._mapping_by_address[address].remove(handler_id)
                    return

    def get_by_id(self, handler_id: str) -> ReadHandler:
        try:
            return self._handlers[handler_id]
        except KeyError as e:
            msg = f"No handler registered for {handler_id}"
            raise ValueError(msg) from e

    def get_by_address_id(self, address_id: str) -> set[ReadHandler]:
        return {
            self.get_by_id(handler_id)
            for handler_id in self._mapping_by_address[address_id]
        }
