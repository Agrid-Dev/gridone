import contextlib
import uuid
from collections import defaultdict
from collections.abc import Callable
from typing import Any

type ListenerCallback = Callable[
    [Any], None
]  # argument is the raw response from transport


def generate_id() -> str:
    return uuid.uuid4().hex[:16]


class ListenerRegistry:
    _listeners: dict[str, ListenerCallback]
    _mapping_by_address: dict[str, set[str]]  # address_id: {listener_ids}

    def __init__(self) -> None:
        self._listeners = {}
        self._mapping_by_address = defaultdict(set)

    def register(self, address_id: str, handler: ListenerCallback) -> str:
        listener_id = generate_id()
        self._listeners[listener_id] = handler
        self._mapping_by_address[address_id].add(listener_id)
        return listener_id

    def remove(self, listener_id: str, address_id: str | None = None) -> None:
        """Removes a handler from the registry.
        Does not throw if handler does not exist."""
        with contextlib.suppress(KeyError):
            del self._listeners[listener_id]
        if address_id is not None:
            self._mapping_by_address[address_id].remove(listener_id)
        else:
            for address, listener_ids in self._mapping_by_address.items():
                if listener_id in listener_ids:
                    self._mapping_by_address[address].remove(listener_id)
                    return

    def get_by_id(self, listener_id: str) -> ListenerCallback:
        try:
            return self._listeners[listener_id]
        except KeyError as e:
            msg = f"No handler registered for {listener_id}"
            raise ValueError(msg) from e

    def get_by_address_id(self, address_id: str) -> set[ListenerCallback]:
        return {
            self.get_by_id(listener_id)
            for listener_id in self._mapping_by_address[address_id]
        }
