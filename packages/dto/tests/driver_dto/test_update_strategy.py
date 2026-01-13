import pytest
from core.driver.update_strategy import (
    DEFAULT_POLLING_INTERVAL,
    DEFAULT_READ_TIMEOUT,
    MAX_TIMEOUT,
    UpdateStrategy,
)
from pydantic import ValidationError


def test_instanciate_update_strategy():
    update_strategy = UpdateStrategy(polling_interval=15, read_timeout=5)
    assert update_strategy.polling_enabled
    assert update_strategy.polling_interval == 15
    assert update_strategy.read_timeout == 5


def test_instanciate_update_strategy_none_values():
    update_strategy = UpdateStrategy()  # ty:ignore[missing-argument]
    assert update_strategy.polling_enabled
    assert update_strategy.polling_interval == DEFAULT_POLLING_INTERVAL
    assert update_strategy.read_timeout == DEFAULT_READ_TIMEOUT


def test_instanciate_update_strategy_disable_polling():
    update_strategy = UpdateStrategy(polling_enabled=False)  # ty:ignore[missing-argument]
    assert not update_strategy.polling_enabled
    assert update_strategy.read_timeout == DEFAULT_READ_TIMEOUT


def test_instanciate_from_dict():
    raw = {"polling": "15min", "timeout": "5s"}
    update_strategy = UpdateStrategy(**raw)  # ty:ignore[invalid-argument-type]
    assert update_strategy.polling_enabled
    assert update_strategy.polling_interval == 15 * 60
    assert update_strategy.read_timeout == 5


def test_invalid_timeout():
    for invalid_timeout in [MAX_TIMEOUT + 1, -1]:
        with pytest.raises(ValidationError):
            _ = UpdateStrategy(read_timeout=invalid_timeout)  # ty:ignore[missing-argument]


def test_polling_disabled():
    raw = {"polling": "disable", "timeout": "60s"}
    update_strategy = UpdateStrategy(**raw)  # ty:ignore[invalid-argument-type]
    assert not update_strategy.polling_enabled
    assert update_strategy.read_timeout == 60
