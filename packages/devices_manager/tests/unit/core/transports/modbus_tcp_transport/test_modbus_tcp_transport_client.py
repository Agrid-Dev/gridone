import asyncio
import logging
from collections.abc import AsyncIterator
from types import SimpleNamespace

import pytest

from devices_manager.core import Driver
from devices_manager.core.codecs.factory import CodecSpec
from devices_manager.core.device import CoreDevice, DeviceBase
from devices_manager.core.driver import AttributeDriver, DriverMetadata, UpdateStrategy
from devices_manager.core.transports.modbus_tcp_transport import (
    ModbusTCPTransportClient,
    ModbusTCPTransportConfig,
)
from devices_manager.core.transports.modbus_tcp_transport.modbus_address import (
    ModbusAddress,
    ModbusAddressType,
)
from devices_manager.core.transports.read_result import ReadError, ReadOk, ReadResult
from devices_manager.core.transports.transport_connection_state import (
    TransportConnectionState,
)
from devices_manager.core.transports.transport_metadata import TransportMetadata
from devices_manager.types import DataType, TransportProtocols


class DummyModbusClient:
    def __init__(self) -> None:
        self.connected = True
        self.last_call = None
        self.calls: list[tuple] = []
        self.fail_at: set[int] = set()

    def _record(self, name: str, address: int, count: int, device_id: int) -> None:
        self.last_call = (name, address, count, device_id)
        self.calls.append(self.last_call)
        if address in self.fail_at:
            msg = f"device refused {name} at {address}"
            raise OSError(msg)

    async def read_holding_registers(
        self, address: int, count: int, device_id: int
    ) -> SimpleNamespace:
        self._record("read_holding_registers", address, count, device_id)
        return SimpleNamespace(registers=list(range(count)))

    async def read_input_registers(
        self, address: int, count: int, device_id: int
    ) -> SimpleNamespace:
        self._record("read_input_registers", address, count, device_id)
        return SimpleNamespace(registers=list(range(count)))

    async def read_coils(
        self, address: int, count: int, device_id: int
    ) -> SimpleNamespace:
        self._record("read_coils", address, count, device_id)
        return SimpleNamespace(bits=[True] * count)

    async def read_discrete_inputs(
        self, address: int, count: int, device_id: int
    ) -> SimpleNamespace:
        self._record("read_discrete_inputs", address, count, device_id)
        return SimpleNamespace(bits=[True] * count)

    async def write_register(self, address: int, value: int, device_id: int) -> None:
        """Single register write."""
        self.last_call = ("write_register", address, value, device_id)

    async def write_registers(
        self, address: int, values: list[int], device_id: int
    ) -> None:
        self.last_call = ("write_registers", address, values, device_id)


@pytest.fixture
def transport() -> ModbusTCPTransportClient:
    metadata = TransportMetadata(id="test", name="test")
    config = ModbusTCPTransportConfig(host="localhost", port=502)
    t = ModbusTCPTransportClient(metadata, config)
    # Bypass real connection logic.
    t._client = DummyModbusClient()  # type: ignore[attr-defined]  # noqa: SLF001
    t.connection_state = TransportConnectionState.connected()
    # Ensure connection lock exists for @connected decorator.
    if not hasattr(t, "_connection_lock"):
        t._connection_lock = asyncio.Lock()  # noqa: SLF001
    return t


@pytest.fixture
def dummy(transport: ModbusTCPTransportClient) -> DummyModbusClient:
    """The fake pymodbus client behind ``transport``, for asserting on the
    requests actually put on the wire."""
    return transport._client  # type: ignore[return-value]  # noqa: SLF001


@pytest.mark.asyncio
async def test_read_holding_register_single(
    transport: ModbusTCPTransportClient,
) -> None:
    address = ModbusAddress(
        type=ModbusAddressType.HOLDING_REGISTER,
        instance=10,
        device_id=1,
        count=1,
    )
    value = await transport.read(address)
    assert value == 0  # first register


@pytest.mark.asyncio
async def test_read_holding_register_multi(
    transport: ModbusTCPTransportClient, dummy: DummyModbusClient
) -> None:
    address = ModbusAddress(
        type=ModbusAddressType.HOLDING_REGISTER,
        instance=10,
        device_id=1,
        count=3,
    )
    value = await transport.read(address)
    assert value == [0, 1, 2]
    assert dummy.last_call == (
        "read_holding_registers",
        10,
        3,
        1,
    )


@pytest.mark.asyncio
async def test_read_input_register_multi(
    transport: ModbusTCPTransportClient, dummy: DummyModbusClient
) -> None:
    address = ModbusAddress(
        type=ModbusAddressType.INPUT_REGISTER,
        instance=5,
        device_id=2,
        count=2,
    )
    value = await transport.read(address)
    assert value == [0, 1]
    assert dummy.last_call == (
        "read_input_registers",
        5,
        2,
        2,
    )


@pytest.mark.asyncio
async def test_write_holding_register_single(
    transport: ModbusTCPTransportClient,
    dummy: DummyModbusClient,
) -> None:
    address = ModbusAddress(
        type=ModbusAddressType.HOLDING_REGISTER,
        instance=7,
        device_id=3,
        count=1,
    )
    await transport.write(address, 42)
    assert dummy.last_call == (
        "write_register",
        7,
        42,
        3,
    )


@pytest.mark.asyncio
async def test_write_holding_register_multi(
    transport: ModbusTCPTransportClient,
    dummy: DummyModbusClient,
) -> None:
    address = ModbusAddress(
        type=ModbusAddressType.HOLDING_REGISTER,
        instance=7,
        device_id=3,
        count=2,
    )
    await transport.write(address, [1, 2])  # ty: ignore[invalid-argument-type]
    assert dummy.last_call == (
        "write_registers",
        7,
        [1, 2],
        3,
    )


@pytest.mark.asyncio
async def test_write_holding_register_multi_mismatched_length(
    transport: ModbusTCPTransportClient,
) -> None:
    address = ModbusAddress(
        type=ModbusAddressType.HOLDING_REGISTER,
        instance=7,
        device_id=3,
        count=2,
    )
    with pytest.raises(ValueError, match="Length of provided values"):
        await transport.write(address, [1])  # ty: ignore[invalid-argument-type]


def _hr(instance: int, count: int = 1) -> ModbusAddress:
    return ModbusAddress(
        type=ModbusAddressType.HOLDING_REGISTER,
        instance=instance,
        device_id=1,
        count=count,
    )


async def _ok_values(results: AsyncIterator[ReadResult]) -> dict[str, object]:
    """Drain a read stream into ``{address_id: value}``, failing the test if any
    address came back as an error."""
    values: dict[str, object] = {}
    async for result in results:
        assert isinstance(result, ReadOk), result
        values[result.address_id] = result.value
    return values


def _modbus_driver(reads: dict[str, str]) -> Driver:
    return Driver(
        metadata=DriverMetadata(id="wago_like"),
        env={},
        transport=TransportProtocols.MODBUS_TCP,
        device_config_required=[],
        update_strategy=UpdateStrategy(),
        attributes={
            name: AttributeDriver(
                name=name,
                data_type=DataType.INT,
                read=read,
                codecs=[CodecSpec(name="identity", argument="")],
            )
            for name, read in reads.items()
        },
    )


class TestPollCycleBatching:
    """A device poll cycle, not just a bare transport call, must issue one
    request per block instead of one per attribute."""

    @pytest.mark.asyncio
    async def test_poll_cycle_reads_contiguous_attributes_in_one_request(
        self, transport: ModbusTCPTransportClient, dummy: DummyModbusClient
    ) -> None:
        device = CoreDevice.from_base(
            DeviceBase(id="d1", name="wago", config={"device_id": 1}),
            driver=_modbus_driver({"a": "HR10", "b": "HR11", "c": "HR12"}),
            transport=transport,
        )

        await device._read_group(["a", "b", "c"])  # noqa: SLF001

        assert dummy.calls == [("read_holding_registers", 10, 3, 1)]
        assert [device.get_attribute(n).current_value for n in ("a", "b", "c")] == [
            0,
            1,
            2,
        ]

    @pytest.mark.asyncio
    async def test_poll_cycle_isolates_a_failed_block(
        self, transport: ModbusTCPTransportClient, dummy: DummyModbusClient
    ) -> None:
        dummy.fail_at = {10}
        device = CoreDevice.from_base(
            DeviceBase(id="d1", name="wago", config={"device_id": 1}),
            driver=_modbus_driver({"a": "HR10", "b": "HR11", "c": "HR30"}),
            transport=transport,
        )

        await device._read_group(["a", "b", "c"])  # noqa: SLF001

        # The dead block sinks only its own members; the rest of the cycle lands.
        assert device.get_attribute("a").current_value is None
        assert device.get_attribute("b").current_value is None
        assert device.get_attribute("c").current_value == 0


class TestReadMany:
    @pytest.mark.asyncio
    async def test_contiguous_addresses_read_in_one_request(
        self, transport: ModbusTCPTransportClient, dummy: DummyModbusClient
    ) -> None:
        addresses = [_hr(10), _hr(11), _hr(12)]

        values = await _ok_values(transport.read_many(addresses))

        assert dummy.calls == [("read_holding_registers", 10, 3, 1)]
        assert values == {_hr(10).id: 0, _hr(11).id: 1, _hr(12).id: 2}

    @pytest.mark.asyncio
    async def test_non_contiguous_addresses_split_into_separate_requests(
        self, transport: ModbusTCPTransportClient, dummy: DummyModbusClient
    ) -> None:
        # max_gap defaults to 0, so the 11..19 hole is never bridged.
        results = [r async for r in transport.read_many([_hr(10), _hr(20)])]

        assert dummy.calls == [
            ("read_holding_registers", 10, 1, 1),
            ("read_holding_registers", 20, 1, 1),
        ]
        assert len(results) == 2

    @pytest.mark.asyncio
    async def test_raw_shape_matches_single_reads(
        self, transport: ModbusTCPTransportClient
    ) -> None:
        """Batching must not change what codecs receive: a bare int for
        count=1, a list for count>1."""
        single, multi = _hr(10), _hr(11, 2)

        values = await _ok_values(transport.read_many([single, multi]))

        assert values[single.id] == 0
        assert values[multi.id] == [1, 2]

    @pytest.mark.asyncio
    async def test_failed_block_fails_only_its_members(
        self, transport: ModbusTCPTransportClient, dummy: DummyModbusClient
    ) -> None:
        dummy.fail_at = {10}
        addresses = [_hr(10), _hr(11), _hr(30)]

        results = {r.address_id: r async for r in transport.read_many(addresses)}

        assert isinstance(results[_hr(10).id], ReadError)
        assert isinstance(results[_hr(11).id], ReadError)
        assert isinstance(results[_hr(30).id], ReadOk)

    @pytest.mark.parametrize(
        ("address_type", "expected_call", "expected_value"),
        [
            pytest.param(ModbusAddressType.COIL, "read_coils", True, id="coil"),
            pytest.param(
                ModbusAddressType.DISCRETE_INPUT,
                "read_discrete_inputs",
                True,
                id="discrete_input",
            ),
            pytest.param(
                ModbusAddressType.INPUT_REGISTER,
                "read_input_registers",
                0,
                id="input_register",
            ),
        ],
    )
    @pytest.mark.asyncio
    async def test_address_types_never_share_a_request(
        self,
        transport: ModbusTCPTransportClient,
        dummy: DummyModbusClient,
        address_type: ModbusAddressType,
        expected_call: str,
        expected_value: bool | int,
    ) -> None:
        other = ModbusAddress(type=address_type, instance=11, device_id=1, count=1)
        addresses = [_hr(10), other]

        values = await _ok_values(transport.read_many(addresses))

        assert sorted(call[0] for call in dummy.calls) == sorted(
            [expected_call, "read_holding_registers"]
        )
        assert values[other.id] == expected_value
        assert values[_hr(10).id] == 0

    @pytest.mark.asyncio
    async def test_duplicate_addresses_read_once(
        self, transport: ModbusTCPTransportClient, dummy: DummyModbusClient
    ) -> None:
        results = [r async for r in transport.read_many([_hr(10), _hr(10)])]

        assert dummy.calls == [("read_holding_registers", 10, 1, 1)]
        assert len(results) == 1

    @pytest.mark.asyncio
    async def test_nothing_logged_when_there_is_nothing_to_read(
        self, transport: ModbusTCPTransportClient, caplog: pytest.LogCaptureFixture
    ) -> None:
        """An empty sweep plans no blocks; it must not emit an empty batch line
        on every poll of every transport."""
        with caplog.at_level(
            logging.DEBUG,
            logger="devices_manager.core.transports.modbus_tcp_transport.client",
        ):
            results = [r async for r in transport.read_many([])]

        assert results == []
        assert "block read(s)" not in caplog.text

    @pytest.mark.asyncio
    async def test_block_count_and_ranges_are_logged(
        self, transport: ModbusTCPTransportClient, caplog: pytest.LogCaptureFixture
    ) -> None:
        with caplog.at_level(
            logging.DEBUG,
            logger="devices_manager.core.transports.modbus_tcp_transport.client",
        ):
            [r async for r in transport.read_many([_hr(10), _hr(11), _hr(30)])]

        assert "2 block read(s)" in caplog.text
        assert "HR10:2" in caplog.text
        assert "HR30:1" in caplog.text

    @pytest.mark.asyncio
    async def test_an_urgent_read_is_not_starved_by_a_sweep(
        self, transport: ModbusTCPTransportClient
    ) -> None:
        """Reads are serialized per block rather than for the whole sweep, so a
        single read still lands while a sweep is suspended mid-iteration."""
        sweep = transport.read_many([_hr(10), _hr(30)])
        await anext(sweep)

        # Serializing the whole sweep instead would deadlock this read.
        value = await asyncio.wait_for(transport.read(_hr(99)), timeout=1)

        assert value == 0
        await sweep.aclose()


_ASYNC_CLIENT = (
    "devices_manager.core.transports.modbus_tcp_transport.client.AsyncModbusTcpClient"
)


class _FakeModbusClient:
    """Stands in for AsyncModbusTcpClient, tracking instantiation and close."""

    instances: list["_FakeModbusClient"] = []  # noqa: RUF012

    def __init__(self, host: str, port: int, timeout: float) -> None:
        self.host, self.port, self.timeout = host, port, timeout
        self.connected = False
        self.closed = False
        _FakeModbusClient.instances.append(self)

    async def connect(self) -> None:
        self.connected = True

    def close(self) -> None:
        self.closed = True
        self.connected = False


@pytest.fixture
def fake_modbus(monkeypatch: pytest.MonkeyPatch) -> type[_FakeModbusClient]:
    _FakeModbusClient.instances = []
    monkeypatch.setattr(_ASYNC_CLIENT, _FakeModbusClient)
    return _FakeModbusClient


def _fresh() -> ModbusTCPTransportClient:
    return ModbusTCPTransportClient(
        TransportMetadata(id="t", name="t"),
        ModbusTCPTransportConfig(host="localhost", port=502),
    )


@pytest.mark.asyncio
async def test_concurrent_connect_creates_single_client(
    fake_modbus: type[_FakeModbusClient],
) -> None:
    """Concurrent reads on one transport race into connect(); only one client
    must be built. Previously each call spawned (and leaked) its own socket,
    exhausting the WAGO's Modbus TCP connection pool."""
    transport = _fresh()

    await asyncio.gather(transport.connect(), transport.connect())

    assert len(fake_modbus.instances) == 1
    assert transport.connection_state.is_connected


@pytest.mark.asyncio
async def test_reconnect_closes_previous_client(
    fake_modbus: type[_FakeModbusClient],
) -> None:
    """When the socket dropped, reconnect must close the old client, not leak it."""
    transport = _fresh()
    await transport.connect()
    fake_modbus.instances[0].connected = False  # WAGO closed the idle socket

    await transport.connect()

    assert len(fake_modbus.instances) == 2
    assert fake_modbus.instances[0].closed is True
