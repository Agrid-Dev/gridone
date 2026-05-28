import pytest
from bacpypes3.primitivedata import Enumerated, Integer, Real, Unsigned

from devices_manager.core.transports.bacnet_transport.client import to_native


class _StrSubclass(str):
    """Stands in for bacpypes CharacterString (a str subclass)."""

    __slots__ = ()


@pytest.mark.parametrize(
    ("value", "expected", "expected_type"),
    [
        (Real(22.5), 22.5, float),
        (Unsigned(4), 4, int),
        (Integer(-3), -3, int),
        (Enumerated(1), 1, int),
        (_StrSubclass("auto"), "auto", str),
        (True, True, bool),
    ],
)
def test_to_native_returns_plain_python_types(
    value: object, expected: object, expected_type: type
) -> None:
    """bacpypes wrappers subclass float/int/str; downstream exact-type lookups
    (e.g. timeseries) need plain Python primitives."""
    result = to_native(value)
    assert result == expected
    assert type(result) is expected_type
