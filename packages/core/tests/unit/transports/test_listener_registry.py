from typing import Any

import pytest
from core.transports.listener_registry import ListenerRegistry


def mock_callback(value: Any) -> None:
    print(f"Handling: {value}")


def mock_callback_2(value: Any) -> None:
    print(f"Handling (2): {value}")


def test_register_handler() -> None:
    registry = ListenerRegistry()
    listener_id = registry.register("address_A", mock_callback)
    assert isinstance(listener_id, str)
    assert len(listener_id) > 1
    assert registry.get_by_id(listener_id) == mock_callback


def test_get_by_address_no_duplicates_same_handler() -> None:
    registry = ListenerRegistry()
    registry.register("address_A", mock_callback)
    registry.register("address_A", mock_callback)
    handlers_A = registry.get_by_address_id("address_A")  # noqa: N806
    assert len(handlers_A) == 1
    for handler in handlers_A:
        assert handler == mock_callback


def test_get_by_address_no_duplicates_different_handler() -> None:
    registry = ListenerRegistry()
    registry.register("address_A", mock_callback)
    registry.register("address_A", mock_callback_2)
    listeners_A = registry.get_by_address_id("address_A")  # noqa: N806
    assert len(listeners_A) == 2
    assert mock_callback in listeners_A
    assert mock_callback_2 in listeners_A


def test_remove() -> None:
    registry = ListenerRegistry()
    address_id = "address_A"
    listener_id_1 = registry.register(address_id, mock_callback)
    listener_id_2 = registry.register(address_id, mock_callback_2)
    assert registry.get_by_id(listener_id_1) == mock_callback
    registry.remove(listener_id_1)
    with pytest.raises(ValueError):  # noqa: PT011
        registry.get_by_id(listener_id_1)
    assert len(registry.get_by_address_id(address_id)) == 1
    registry.remove(listener_id_2)
    with pytest.raises(ValueError):  # noqa: PT011
        registry.get_by_id(listener_id_2)
    assert len(registry.get_by_address_id(address_id)) == 0
    registry.remove(listener_id_2)  # should not throw (idempotency)
