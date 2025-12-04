import pytest
from core.types import AttributeValueType
from core.value_parsers.registry.identity_parser import IdentityParser


@pytest.mark.parametrize(
    ("value"),
    [("abc"), (1), (1.0), (-1), (True), (False), (None)],
)
def test_identity_parser(value: AttributeValueType) -> None:
    ip = IdentityParser("")
    assert ip.parse(value) == value
    assert ip.revert(value) == value
