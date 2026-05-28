import pytest

from devices_manager.core.transports.bacnet_transport.transport_config import (
    DEFAULT_PORT,
    BacnetTransportConfig,
    is_valid_ip_with_mask,
    validate_ip,
)


@pytest.mark.parametrize(
    ("raw", "expect_valid"),
    [("10.125.0.1/24", True), ("10.125.0.1", True), ("10.125.1", False)],
)
def test_validate_ip_with_mask(raw: str, expect_valid: bool) -> None:
    try:
        s = is_valid_ip_with_mask(raw)
        assert s.endswith(("/8", "/16", "/24", "/32"))
        assert expect_valid
    except ValueError:
        assert not expect_valid


@pytest.mark.parametrize(
    ("raw", "expect_valid"),
    [("192.168.0.99", True), ("10.0.0.1", True), ("nope", False), ("1.2.3", False)],
)
def test_validate_ip(raw: str, expect_valid: bool) -> None:
    if expect_valid:
        assert validate_ip(raw) == raw
    else:
        with pytest.raises(ValueError, match="Invalid IP address"):
            validate_ip(raw)


def test_config_requires_ip_with_mask() -> None:
    with pytest.raises(ValueError, match="ip_with_mask"):
        BacnetTransportConfig()  # type: ignore[call-arg]


def test_config_defaults() -> None:
    config = BacnetTransportConfig(ip_with_mask="192.168.0.5/24")
    assert config.port == DEFAULT_PORT
    assert config.discovery_address is None
    assert config.bbmd_address is None
    assert config.default_write_priority == 8


def test_config_rejects_invalid_bbmd_address() -> None:
    with pytest.raises(ValueError, match="Invalid IP address"):
        BacnetTransportConfig(ip_with_mask="192.168.0.5/24", bbmd_address="not-an-ip")
