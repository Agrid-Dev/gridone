import asyncio
import logging

import pytest
from bacpypes3.apdu import (
    AbortPDU,
    Error,
    ReadAccessResult,
    ReadPropertyACK,
    ReadPropertyMultipleACK,
    RejectPDU,
    SimpleAckPDU,
)
from bacpypes3.basetypes import (
    BinaryPV,
    ErrorType,
    ReadAccessResultElement,
    ReadAccessResultElementChoice,
)
from bacpypes3.pdu import Address
from bacpypes3.primitivedata import (
    Enumerated,
    Integer,
    ObjectIdentifier,
    PropertyIdentifier,
    Real,
    Unsigned,
)

from devices_manager.core import Driver
from devices_manager.core.codecs.factory import CodecSpec
from devices_manager.core.device import CoreDevice, DeviceBase
from devices_manager.core.driver import AttributeDriver, DriverMetadata, UpdateStrategy
from devices_manager.core.transports.bacnet_transport.bacnet_address import (
    BacnetAddress,
)
from devices_manager.core.transports.bacnet_transport.bacnet_types import (
    BacnetObjectType,
)
from devices_manager.core.transports.bacnet_transport.client import (
    BacnetServiceRejectedError,
    BacnetTransportClient,
    _raise_for_response,
    encode_present_value,
    get_device_identifier,
    to_native,
)
from devices_manager.core.transports.bacnet_transport.transport_config import (
    BacnetTransportConfig,
)
from devices_manager.core.transports.read_result import ReadError, ReadOk
from devices_manager.core.transports.transport_connection_state import (
    TransportConnectionState,
)
from devices_manager.core.transports.transport_metadata import TransportMetadata
from devices_manager.types import AttributeValueType, DataType, TransportProtocols

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


class _FakeRequestApp:
    """Stands in for a bacpypes Application's ``request()``: returns scripted
    responses in order and records every request sent."""

    def __init__(self) -> None:
        self.requests: list[object] = []
        self.responses: list[object] = []

    def close(self) -> None:
        pass

    async def request(self, request: object) -> object:
        self.requests.append(request)
        return self.responses.pop(0)


def _addr(
    device_instance: int = 1,
    instance: int = 0,
    *,
    object_type: str = "analog-input",
    property_name: str = "present-value",
) -> BacnetAddress:
    return BacnetAddress(
        device_instance=device_instance,
        object_type=object_type,  # ty: ignore[invalid-argument-type]
        object_instance=instance,
        property_name=property_name,
    )


def _value(result: ReadOk | ReadError) -> AttributeValueType:
    """Narrow a ReadResult to ReadOk and return its value, failing loudly
    (with the actual result) if it came back as a ReadError instead."""
    assert isinstance(result, ReadOk), result
    return result.value


def _connected_client(
    app: _FakeRequestApp, *, device_instances: dict[int, int] | None = None
) -> BacnetTransportClient:
    """A client bypassing connect()/discovery, wired to ``app`` and aware of
    the given ``{device_instance: max_apdu}`` devices."""
    client = _client()
    client._application = app  # noqa: SLF001  # ty: ignore[invalid-assignment]
    client.connection_state = TransportConnectionState.connected()
    client._connection_lock = asyncio.Lock()  # noqa: SLF001
    device_instances = device_instances or {1: 1024}
    client._known_devices = {  # noqa: SLF001
        get_device_identifier(instance): Address("192.168.1.10")
        for instance in device_instances
    }
    client._device_max_apdu = dict(device_instances)  # noqa: SLF001
    return client


def _read_property_ack(value: float) -> ReadPropertyACK:
    return ReadPropertyACK(
        objectIdentifier=ObjectIdentifier("analog-input,0"),
        propertyIdentifier="present-value",
        propertyValue=Real(value),
    )


def _rpm_ack(
    pairs: list[tuple[BacnetAddress, float | None]],
) -> ReadPropertyMultipleACK:
    """One ReadAccessResult per object, one element per address. A ``None``
    value encodes a propertyAccessError element for that address."""
    by_object: dict[ObjectIdentifier, list[tuple[BacnetAddress, float | None]]] = {}
    for address, value in pairs:
        obj_id = ObjectIdentifier(f"{address.object_type},{address.object_instance}")
        by_object.setdefault(obj_id, []).append((address, value))
    results = []
    for obj_id, members in by_object.items():
        elements = []
        for address, value in members:
            choice = (
                ReadAccessResultElementChoice(
                    propertyAccessError=ErrorType(
                        errorClass="property", errorCode="unknownProperty"
                    )
                )
                if value is None
                else ReadAccessResultElementChoice(propertyValue=Real(value))
            )
            elements.append(
                ReadAccessResultElement(
                    propertyIdentifier=PropertyIdentifier(address.property_name),
                    readResult=choice,
                )
            )
        results.append(
            ReadAccessResult(objectIdentifier=obj_id, listOfResults=elements)
        )
    return ReadPropertyMultipleACK(listOfReadAccessResults=results)


class TestRaiseForResponse:
    def test_error_raises_plain_runtime_error(self) -> None:
        response = Error(
            errorClass="property", errorCode="unknownProperty", service_choice=14
        )

        with pytest.raises(RuntimeError) as exc_info:
            _raise_for_response(response, target="t", action="a")

        assert not isinstance(exc_info.value, BacnetServiceRejectedError)

    @pytest.mark.parametrize(
        "response",
        [RejectPDU(reason="unrecognizedService"), AbortPDU(reason="other")],
    )
    def test_reject_and_abort_raise_service_rejected(self, response: object) -> None:
        with pytest.raises(BacnetServiceRejectedError):
            _raise_for_response(response, target="t", action="a")

    def test_unexpected_response_raises_type_error(self) -> None:
        with pytest.raises(TypeError):
            _raise_for_response(SimpleAckPDU(), target="t", action="a")


class TestReadManyRpm:
    @pytest.mark.asyncio
    async def test_addresses_read_in_one_rpm_request(self) -> None:
        app = _FakeRequestApp()
        addresses = [_addr(1, 0), _addr(1, 1)]
        app.responses = [_rpm_ack([(addresses[0], 21.5), (addresses[1], 22.0)])]
        client = _connected_client(app)

        results = {r.address_id: r async for r in client.read_many(addresses)}

        assert len(app.requests) == 1
        assert _value(results[addresses[0].id]) == 21.5
        assert _value(results[addresses[1].id]) == 22.0

    @pytest.mark.asyncio
    async def test_property_access_error_isolates_one_address(self) -> None:
        app = _FakeRequestApp()
        addresses = [_addr(1, 0), _addr(1, 1)]
        app.responses = [_rpm_ack([(addresses[0], None), (addresses[1], 22.0)])]
        client = _connected_client(app)

        results = {r.address_id: r async for r in client.read_many(addresses)}

        assert isinstance(results[addresses[0].id], ReadError)
        assert isinstance(results[addresses[1].id], ReadOk)

    @pytest.mark.asyncio
    async def test_reject_pdu_falls_back_and_disables_rpm_for_the_device(
        self,
    ) -> None:
        app = _FakeRequestApp()
        addresses = [_addr(1, 0), _addr(1, 1)]
        app.responses = [
            RejectPDU(reason="unrecognizedService"),
            _read_property_ack(21.5),
            _read_property_ack(22.0),
        ]
        client = _connected_client(app)

        results = {r.address_id: r async for r in client.read_many(addresses)}

        assert client._rpm_supported[1] is False  # noqa: SLF001
        assert all(isinstance(r, ReadOk) for r in results.values())
        assert _value(results[addresses[0].id]) == 21.5

    @pytest.mark.asyncio
    async def test_abort_pdu_falls_back_and_disables_rpm_for_the_device(self) -> None:
        app = _FakeRequestApp()
        addresses = [_addr(1, 0)]
        app.responses = [AbortPDU(reason="other"), _read_property_ack(21.5)]
        client = _connected_client(app)

        results = [r async for r in client.read_many(addresses)]

        assert client._rpm_supported[1] is False  # noqa: SLF001
        assert isinstance(results[0], ReadOk)

    @pytest.mark.asyncio
    async def test_rpm_unsupported_is_cached_across_calls(self) -> None:
        app = _FakeRequestApp()
        addresses = [_addr(1, 0)]
        app.responses = [
            RejectPDU(reason="unrecognizedService"),
            _read_property_ack(21.5),
            _read_property_ack(22.0),
        ]
        client = _connected_client(app)
        _ = [r async for r in client.read_many(addresses)]

        _ = [r async for r in client.read_many(addresses)]

        # Second sweep never re-attempts RPM: exactly one ReadPropertyRequest.
        assert len(app.responses) == 0
        request_types = [type(r).__name__ for r in app.requests]
        assert request_types.count("ReadPropertyMultipleRequest") == 1
        assert request_types.count("ReadPropertyRequest") == 2

    @pytest.mark.asyncio
    async def test_mixed_devices_one_rpm_one_already_unsupported(self) -> None:
        app = _FakeRequestApp()
        rpm_addr, fallback_addr = _addr(1, 0), _addr(2, 0)
        app.responses = [
            _rpm_ack([(rpm_addr, 21.5)]),
            _read_property_ack(9.0),
        ]
        client = _connected_client(app, device_instances={1: 1024, 2: 1024})
        client._rpm_supported[2] = False  # noqa: SLF001

        results = {
            r.address_id: r async for r in client.read_many([rpm_addr, fallback_addr])
        }

        assert _value(results[rpm_addr.id]) == 21.5
        assert _value(results[fallback_addr.id]) == 9.0

    @pytest.mark.asyncio
    async def test_duplicate_addresses_read_once(self) -> None:
        app = _FakeRequestApp()
        address = _addr(1, 0)
        app.responses = [_rpm_ack([(address, 21.5)])]
        client = _connected_client(app)

        results = [r async for r in client.read_many([address, address])]

        assert len(app.requests) == 1
        assert len(results) == 1

    @pytest.mark.asyncio
    async def test_cache_hit_skips_the_network(self) -> None:
        app = _FakeRequestApp()
        address = _addr(1, 0)
        app.responses = [_read_property_ack(21.5)]
        client = _connected_client(app)
        await client.read(address, "sweep-1")
        assert len(app.requests) == 1

        results = [r async for r in client.read_many([address], "sweep-1")]

        assert len(app.requests) == 1
        assert isinstance(results[0], ReadOk)
        assert results[0].value == 21.5

    @pytest.mark.asyncio
    async def test_batch_and_fallback_are_logged(
        self, caplog: pytest.LogCaptureFixture
    ) -> None:
        caplog.set_level(logging.DEBUG)
        app = _FakeRequestApp()
        addresses = [_addr(1, 0)]
        app.responses = [
            RejectPDU(reason="unrecognizedService"),
            _read_property_ack(21.5),
        ]
        client = _connected_client(app)

        _ = [r async for r in client.read_many(addresses)]

        assert "coalesced into" in caplog.text
        assert "falling back to per-property reads" in caplog.text

    @pytest.mark.asyncio
    async def test_ack_missing_an_address_reports_it_as_error_not_dropped(
        self,
    ) -> None:
        """A device that omits a result for one requested property (partial
        RPM support) must not silently drop that address — it has to surface
        as a ReadError so the attribute's failure is logged, not lost."""
        app = _FakeRequestApp()
        present, missing = _addr(1, 0), _addr(1, 1)
        app.responses = [_rpm_ack([(present, 21.5)])]  # ACK omits `missing`
        client = _connected_client(app)

        results = {r.address_id: r async for r in client.read_many([present, missing])}

        assert results.keys() == {present.id, missing.id}
        assert isinstance(results[present.id], ReadOk)
        assert isinstance(results[missing.id], ReadError)

    @pytest.mark.asyncio
    async def test_decode_failure_is_isolated_not_propagated(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """A crash while decoding an otherwise-successful ACK (malformed
        property value) must be caught and turned into ReadErrors, not
        propagate out of read_many and kill the caller's poll loop."""
        import devices_manager.core.transports.bacnet_transport.client as client_module

        def _boom(*_args: object, **_kwargs: object) -> None:
            msg = "malformed property value"
            raise ValueError(msg)

        monkeypatch.setattr(client_module, "_decode_rpm", _boom)
        app = _FakeRequestApp()
        addresses = [_addr(1, 0), _addr(1, 1)]
        app.responses = [_rpm_ack([(addresses[0], 21.5), (addresses[1], 22.0)])]
        client = _connected_client(app)

        results = {r.address_id: r async for r in client.read_many(addresses)}

        assert all(isinstance(r, ReadError) for r in results.values())

    @pytest.mark.asyncio
    async def test_rejection_on_one_chunk_skips_rpm_for_later_chunks_same_sweep(
        self,
    ) -> None:
        """A device needing more than one RPM chunk that rejects the first
        must not re-attempt RPM for the remaining chunks of the same sweep —
        the rejection already proved the service unsupported."""
        app = _FakeRequestApp()
        # max_apdu=50 budgets 2 single-property objects per chunk, so 4
        # addresses split into 2 chunks.
        addresses = [_addr(1, i) for i in range(4)]
        app.responses = [
            RejectPDU(reason="unrecognizedService"),  # chunk 1's RPM attempt
            _read_property_ack(0.0),  # chunk 1 fallback, address 0
            _read_property_ack(1.0),  # chunk 1 fallback, address 1
            _read_property_ack(2.0),  # chunk 2 fallback, address 2 (no RPM retry)
            _read_property_ack(3.0),  # chunk 2 fallback, address 3
        ]
        client = _connected_client(app, device_instances={1: 50})

        results = {r.address_id: r async for r in client.read_many(addresses)}

        assert all(isinstance(r, ReadOk) for r in results.values())
        request_types = [type(r).__name__ for r in app.requests]
        assert request_types.count("ReadPropertyMultipleRequest") == 1
        assert request_types.count("ReadPropertyRequest") == 4


def _bacnet_driver(reads: dict[str, str]) -> Driver:
    return Driver(
        metadata=DriverMetadata(id="thermocktat_like"),
        env={},
        transport=TransportProtocols.BACNET,
        device_config_required=[],
        update_strategy=UpdateStrategy(),
        attributes={
            name: AttributeDriver(
                name=name,
                data_type=DataType.FLOAT,
                read=read,
                codecs=[CodecSpec(name="identity", argument="")],
            )
            for name, read in reads.items()
        },
    )


class TestPollCycleBatching:
    """A device poll cycle, not just a bare transport call, must issue one
    RPM request instead of one ReadProperty per attribute."""

    @pytest.mark.asyncio
    async def test_poll_cycle_reads_attributes_in_one_rpm_request(self) -> None:
        app = _FakeRequestApp()
        addresses = [_addr(1, 0), _addr(1, 1), _addr(1, 2)]
        app.responses = [
            _rpm_ack([(addresses[0], 1.0), (addresses[1], 2.0), (addresses[2], 3.0)])
        ]
        client = _connected_client(app)
        device = CoreDevice.from_base(
            DeviceBase(id="d1", name="thermocktat", config={"device_instance": 1}),
            driver=_bacnet_driver({"a": "AI0", "b": "AI1", "c": "AI2"}),
            transport=client,
        )

        await device._read_group(["a", "b", "c"])  # noqa: SLF001

        assert len(app.requests) == 1
        assert [device.get_attribute(n).current_value for n in ("a", "b", "c")] == [
            1.0,
            2.0,
            3.0,
        ]

    @pytest.mark.asyncio
    async def test_poll_cycle_isolates_a_rejected_devices_fallback_failure(
        self,
    ) -> None:
        app = _FakeRequestApp()
        app.responses = [
            RejectPDU(reason="unrecognizedService"),
            _read_property_ack(1.0),
            Error(
                errorClass="property", errorCode="unknownProperty", service_choice=12
            ),
        ]
        client = _connected_client(app)
        device = CoreDevice.from_base(
            DeviceBase(id="d1", name="thermocktat", config={"device_instance": 1}),
            driver=_bacnet_driver({"a": "AI0", "b": "AI1"}),
            transport=client,
        )

        await device._read_group(["a", "b"])  # noqa: SLF001

        assert device.get_attribute("a").current_value == 1.0
        assert device.get_attribute("b").current_value is None
