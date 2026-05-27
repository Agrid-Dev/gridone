import pytest
from bacpypes3.primitivedata import Enumerated, Integer, Real, Unsigned

from devices_manager.core.transports.bacnet_transport.client import (
    BacnetTransportClient,
    to_native,
)
from devices_manager.core.transports.bacnet_transport.transport_config import (
    BacnetTransportConfig,
)
from devices_manager.core.transports.transport_metadata import TransportMetadata


class _StrSubclass(str):
    """Stands in for bacpypes CharacterString (a str subclass)."""

    __slots__ = ()


def _client() -> BacnetTransportClient:
    return BacnetTransportClient(
        TransportMetadata(id="t", name="t"),
        BacnetTransportConfig(ip_with_mask="10.0.0.1/24"),
    )


@pytest.mark.asyncio
async def test_close_before_connect_is_safe() -> None:
    """Closing a never-connected client must not raise (idempotent teardown)."""
    await _client().close()


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
