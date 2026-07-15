from devices_manager.core.driver.healthcheck import HealthCheck


def test_expected_push_interval_defaults_to_none():
    assert HealthCheck().expected_push_interval is None


def test_expected_push_interval_from_int():
    assert HealthCheck(expected_push_interval=900).expected_push_interval == 900


def test_expected_push_interval_from_string():
    raw = {"expected_push_interval": "15min"}
    healthcheck = HealthCheck(**raw)  # ty:ignore[invalid-argument-type]
    assert healthcheck.expected_push_interval == 900
