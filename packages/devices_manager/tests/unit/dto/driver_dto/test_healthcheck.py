import pytest
from pydantic import ValidationError

from devices_manager.core.driver.healthcheck import HealthCheck


def test_expected_push_interval_defaults_to_none():
    assert HealthCheck().expected_push_interval is None


def test_expected_push_interval_from_int():
    assert HealthCheck(expected_push_interval=900).expected_push_interval == 900


def test_expected_push_interval_from_string():
    raw = {"expected_push_interval": "15min"}
    healthcheck = HealthCheck(**raw)  # ty:ignore[invalid-argument-type]
    assert healthcheck.expected_push_interval == 900


def test_max_attribute_loss_defaults_to_zero():
    assert HealthCheck().max_attribute_loss == 0.0


def test_max_attribute_loss_accepts_a_ratio():
    assert HealthCheck(max_attribute_loss=0.2).max_attribute_loss == 0.2


@pytest.mark.parametrize("value", [-0.1, 1.0, 1.5])
def test_max_attribute_loss_rejects_values_outside_zero_to_one(value: float):
    with pytest.raises(ValidationError):
        HealthCheck(max_attribute_loss=value)
