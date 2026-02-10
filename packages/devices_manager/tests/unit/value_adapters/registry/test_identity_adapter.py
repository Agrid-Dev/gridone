import pytest
from devices_manager.core.value_adapters.registry.identity_adapter import (
    identity_adapter,
)
from devices_manager.types import AttributeValueType


@pytest.mark.parametrize(
    ("value"),
    [("abc"), (1), (1.0), (-1), (True), (False), (None)],
)
def test_identity_parser(value: AttributeValueType) -> None:
    ip = identity_adapter("")
    assert ip.decode(value) == value
    assert ip.encode(value) == value
