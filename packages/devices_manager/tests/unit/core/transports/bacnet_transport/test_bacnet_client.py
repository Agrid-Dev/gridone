import asyncio

import pytest
from bacpypes3.basetypes import BinaryPV
from bacpypes3.primitivedata import Enumerated, Integer, Real, Unsigned

from devices_manager.core.transports.bacnet_transport.bacnet_types import (
    BacnetObjectType,
)
from devices_manager.core.transports.bacnet_transport.client import (
    BacnetTransportClient,
    encode_present_value,
    to_native,
)
from devices_manager.core.transports.bacnet_transport.transport_config import (
    BacnetTransportConfig,
)
from devices_manager.core.transports.transport_connection_state import (
    TransportConnectionState,
)
from devices_manager.core.transports.transport_metadata import TransportMetadata
from devices_manager.types import AttributeValueType

_MAKE_APP = (
    "devices_manager.core.transports.bacnet_transport.client.make_local_application"
)


class _FakeApp:
    """Stands in for a bacpypes Application, tracking instantiation and close."""

    instances: list["_FakeApp"] = []  # noqa: RUF012

    def __init__(self) -> None:
        self.closed = False
        _FakeApp.instances.append(self)

    def close(self) -> None:
        self.closed = True


@pytest.fixture
def fake_app(monkeypatch: pytest.MonkeyPatch) -> type[_FakeApp]:
    """Patch the Application factory + discovery so connect() needs no network."""
    _FakeApp.instances = []
    monkeypatch.setattr(_MAKE_APP, lambda _config: _FakeApp())

    async def _no_discover(_self: BacnetTransportClient) -> dict:
        return {}

    monkeypatch.setattr(BacnetTransportClient, "_discover_devices", _no_discover)
    return _FakeApp


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


@pytest.mark.asyncio
async def test_concurrent_connect_binds_single_application(
    fake_app: type[_FakeApp],
) -> None:
    """Two concurrent connect() calls (the @connected race) must bind exactly one
    Application. Previously each caller bound its own stack on :47808, so replies
    scattered across sockets and every read timed out."""
    client = _client()

    await asyncio.gather(client.connect(), client.connect())

    assert len(fake_app.instances) == 1
    assert client.connection_state.is_connected


@pytest.mark.asyncio
async def test_reconnect_closes_previous_application(
    fake_app: type[_FakeApp],
) -> None:
    """Reconnecting after an error must close the old Application, not leak it."""
    client = _client()
    await client.connect()
    client.connection_state = TransportConnectionState.connection_error("boom")

    await client.connect()

    assert len(fake_app.instances) == 2
    assert fake_app.instances[0].closed is True


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


@pytest.mark.parametrize(
    ("object_type", "value", "expected_type", "expected"),
    [
        (BacnetObjectType.ANALOG_VALUE, 22.5, Real, 22.5),
        # An integer written to an analog object is still a Real.
        (BacnetObjectType.ANALOG_VALUE, 21, Real, 21.0),
        (BacnetObjectType.BINARY_VALUE, True, BinaryPV, 1),
        (BacnetObjectType.BINARY_VALUE, False, BinaryPV, 0),
        # A multi-state present-value is Unsigned — not the Signed integer a
        # plain Python int would otherwise encode to.
        (BacnetObjectType.MULTISTATE_VALUE, 2, Unsigned, 2),
    ],
)
def test_encode_present_value_uses_the_object_types_datatype(
    object_type: BacnetObjectType,
    value: AttributeValueType,
    expected_type: type,
    expected: object,
) -> None:
    result = encode_present_value(object_type, value)
    assert type(result) is expected_type
    assert result == expected
