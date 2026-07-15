import pytest
from pydantic import ValidationError

from devices_manager.core.driver.update_strategy import (
    DEFAULT_POLLING_INTERVAL,
    DEFAULT_READ_TIMEOUT,
    MAX_TIMEOUT,
    UpdateStrategy,
)


def test_instanciate_update_strategy():
    update_strategy = UpdateStrategy(polling_interval=15, read_timeout=5)
    assert update_strategy.polling_enabled
    assert update_strategy.polling_interval == 15
    assert update_strategy.read_timeout == 5


def test_instanciate_update_strategy_none_values():
    update_strategy = UpdateStrategy()
    assert update_strategy.polling_enabled
    assert update_strategy.polling_interval == DEFAULT_POLLING_INTERVAL
    assert update_strategy.read_timeout == DEFAULT_READ_TIMEOUT


def test_instanciate_update_strategy_disable_polling():
    update_strategy = UpdateStrategy(polling_enabled=False)
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
            _ = UpdateStrategy(read_timeout=invalid_timeout)


def test_polling_disabled():
    raw = {"polling": "disable", "timeout": "60s"}
    update_strategy = UpdateStrategy(**raw)  # ty:ignore[invalid-argument-type]
    assert not update_strategy.polling_enabled
    assert update_strategy.read_timeout == 60


def test_polling_groups_defaults_to_empty_dict():
    assert UpdateStrategy().polling_groups == {}


def test_polling_groups_parses_duration_strings():
    raw = {"polling_groups": {"core": "5s", "config": "1h"}}
    strategy = UpdateStrategy(**raw)  # ty:ignore[invalid-argument-type]
    assert strategy.polling_groups == {"core": 5, "config": 3600}


def test_polling_groups_accepts_ints():
    strategy = UpdateStrategy(polling_groups={"core": 5})
    assert strategy.polling_groups == {"core": 5}
