from typing import Any

import pytest
from core.transports.read_handler_registry import ReadHandlerRegistry


def mock_handler(value: Any) -> None:
    print(f"Handling: {value}")


def mock_handler_2(value: Any) -> None:
    print(f"Handling (2): {value}")


def test_register_handler() -> None:
    registry = ReadHandlerRegistry()
    handler_id = registry.register("address_A", mock_handler)
    assert isinstance(handler_id, str)
    assert len(handler_id) > 1
    assert registry.get_by_id(handler_id) == mock_handler


def test_get_by_address_no_duplicates_same_handler() -> None:
    registry = ReadHandlerRegistry()
    registry.register("address_A", mock_handler)
    registry.register("address_A", mock_handler)
    handlers_A = registry.get_by_address_id("address_A")  # noqa: N806
    assert len(handlers_A) == 1
    for handler in handlers_A:
        assert handler == mock_handler


def test_get_by_address_no_duplicates_different_handler() -> None:
    registry = ReadHandlerRegistry()
    registry.register("address_A", mock_handler)
    registry.register("address_A", mock_handler_2)
    handlers_A = registry.get_by_address_id("address_A")  # noqa: N806
    assert len(handlers_A) == 2
    assert mock_handler in handlers_A
    assert mock_handler_2 in handlers_A


def test_remove() -> None:
    registry = ReadHandlerRegistry()
    address_id = "address_A"
    handler_id_1 = registry.register(address_id, mock_handler)
    handler_id_2 = registry.register(address_id, mock_handler_2)
    assert registry.get_by_id(handler_id_1) == mock_handler
    registry.remove(handler_id_1)
    with pytest.raises(ValueError):  # noqa: PT011
        registry.get_by_id(handler_id_1)
    assert len(registry.get_by_address_id(address_id)) == 1
    registry.remove(handler_id_2)
    with pytest.raises(ValueError):  # noqa: PT011
        registry.get_by_id(handler_id_2)
    assert len(registry.get_by_address_id(address_id)) == 0
    registry.remove(handler_id_2)  # should not throw (idempotency)
