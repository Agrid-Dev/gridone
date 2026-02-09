import pytest
from devices_manager.transports.bacnet_transport.transport_config import (
    is_valid_ip_with_mask,
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
