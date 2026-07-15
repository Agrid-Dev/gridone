from __future__ import annotations

import asyncio
import contextlib
from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest

from devices_manager.core import Driver, TransportClient
from devices_manager.core.codecs.factory import CodecSpec
from devices_manager.core.device import (
    Attribute,
    CoreDevice,
    DeviceBase,
    FaultAttribute,
)
from devices_manager.core.device.connection_status import CONNECTION_STATUS_ATTR
from devices_manager.core.driver import (
    AttributeDriver,
    DriverMetadata,
    FaultAttributeDriver,
    UpdateStrategy,
)
from devices_manager.types import ConnectionStatus, DataType, TransportProtocols
from models.errors import ConfirmationError
from models.types import Severity

from ..fixtures.transport_clients import MockTransportAddress


@pytest.fixture
def device(mock_transport_client, driver) -> CoreDevice:
    return CoreDevice.from_base(
        DeviceBase(id="d1", name="My pull device", config={"some_id": "abcd"}),
        driver=driver,
        transport=mock_transport_client,
    )


@pytest.fixture
def device_w_push_transport(
    mock_push_transport_client, driver_w_push_transport
) -> CoreDevice:
    return CoreDevice.from_base(
        DeviceBase(id="d2", name="My push device", config={"some_id": "abcd"}),
        driver=driver_w_push_transport,
        transport=mock_push_transport_client,
    )


class TestDeviceCreation:
    def test_build_protocol_mismatch(
        self, driver_w_push_transport, mock_transport_client
    ):
        with pytest.raises(TypeError):
            _ = CoreDevice(
                id="some_id",
                name="name",
                config={},
                driver=driver_w_push_transport,
                transport=mock_transport_client,
                attributes={},
            )

    def test_build_from_raw_raw(
        self, driver: Driver, mock_transport_client: TransportClient
    ):
        device = CoreDevice.from_base(
            DeviceBase(id="d1", name="my device", config={}),
            transport=mock_transport_client,
            driver=driver,
        )
        assert device.id == "d1"
        expected = set(driver.attributes) | {CONNECTION_STATUS_ATTR}
        assert set(device.attributes) == expected

    def test_initialize_attributes(self, driver, mock_transport_client):
        device = CoreDevice.from_base(
            DeviceBase(id="d1", name="My pull device", config={"some_id": "abcd"}),
            driver=driver,
            transport=mock_transport_client,
            initial_values={"temperature": 20},
        )
        assert device.get_attribute_value("temperature") == 20

    def test_type_reflects_driver_type(self, driver, mock_transport_client):
        """Regression: CoreDevice.type is a live property from driver.type."""
        device = CoreDevice.from_base(
            DeviceBase(id="d1", name="my device", config={}),
            driver=driver,
            transport=mock_transport_client,
        )
        assert device.type == driver.type

    def test_value_options_propagated_from_driver(self, mock_transport_client):
        driver = Driver(
            metadata=DriverMetadata(id="test"),
            env={},
            transport=TransportProtocols.HTTP,
            device_config_required=[],
            update_strategy=UpdateStrategy(),
            attributes={
                "mode": AttributeDriver(
                    name="mode",
                    data_type=DataType.STRING,
                    read="GET /mode",
                    write="POST /mode",
                    codecs=[CodecSpec(name="options", argument=["heat", "cool"])],
                )
            },
        )
        device = CoreDevice.from_base(
            DeviceBase(id="d1", name="dev", config={}),
            driver=driver,
            transport=mock_transport_client,
        )
        assert device.attributes["mode"].value_options == ["heat", "cool"]


class TestDeviceRead:
    @pytest.mark.asyncio
    async def test_read_value_ok(self, device: CoreDevice, mock_transport_client):
        mock_transport_client.read = AsyncMock(return_value=23.5)
        value = await device.read_attribute_value("temperature")
        assert value == 23.5
        mock_transport_client.read.assert_called_once()

    @pytest.mark.asyncio
    async def test_read_value_with_context_rendering(
        self, device: CoreDevice, mock_transport_client
    ):
        mock_transport_client.read = AsyncMock(return_value=23.5)
        await device.read_attribute_value("temperature_setpoint")
        expected_address = MockTransportAddress(address="GET /abcd/setpoint")
        actual_address = mock_transport_client.read.call_args[0][0]
        assert actual_address.address == expected_address.address

    @pytest.mark.asyncio
    async def test_read_value_with_adapter(
        self, device: CoreDevice, mock_transport_client
    ):
        mock_transport_client.read = AsyncMock(
            return_value={"data": {"temperature": 23.5}}
        )
        value = await device.read_attribute_value("temperature_w_adapter")
        assert value == 23.5
        mock_transport_client.read.assert_called_once()

    @pytest.mark.skip
    def test_handle_transport_error(self, device: CoreDevice):
        """@TODO: check that a transport error is raised
        if an error occurs in transport"""


class TestDeviceWrite:
    @pytest.mark.asyncio
    async def test_write_value_calls_transport(
        self, device: CoreDevice, mock_transport_client
    ):
        mock_transport_client.write = AsyncMock()
        await device.write_attribute_value("temperature_setpoint", 20, confirm=False)
        mock_transport_client.write.assert_called_once()

    @pytest.mark.asyncio
    async def test_write_value_calls_transport_with_context_rendering(
        self, device: CoreDevice, mock_transport_client
    ):
        mock_transport_client.write = AsyncMock()
        await device.write_attribute_value("temperature_setpoint", 20, confirm=False)
        expected_address = MockTransportAddress(address="POST /abcd/setpoint")
        assert mock_transport_client.write.call_args is not None
        args, _ = mock_transport_client.write.call_args  # args: (address, value)
        assert args[0].address == expected_address.address
        assert args[1] == 20

    @pytest.mark.asyncio
    async def test_write_value_calls_transport_with_adapter(
        self, device: CoreDevice, mock_transport_client
    ):
        mock_transport_client.write = AsyncMock()
        await device.write_attribute_value(
            "temperature_setpoint_w_reversible_adapter", 20, confirm=False
        )
        args, _ = mock_transport_client.write.call_args  # args: (address, value)
        assert args[1] == 200  # reverse-scaled value

    @pytest.mark.asyncio
    async def test_write_value_with_confirm(
        self, device: CoreDevice, mock_transport_client
    ):
        mock_transport_client.write = AsyncMock()
        mock_transport_client.read = AsyncMock(return_value=20)
        await device.write_attribute_value("temperature_setpoint", 20, confirm=True)
        mock_transport_client.write.assert_called_once()
        mock_transport_client.read.assert_called_once()
        assert device.attributes["temperature_setpoint"].current_value == 20

    @pytest.mark.asyncio
    async def test_write_attribute_value_returns_attribute(
        self, device: CoreDevice, mock_transport_client
    ):
        mock_transport_client.write = AsyncMock()
        result = await device.write_attribute_value(
            "temperature_setpoint", 20, confirm=False
        )
        assert isinstance(result, Attribute)
        assert result.current_value == 20

    @pytest.mark.asyncio
    async def test_write_value_not_writable(self, device: CoreDevice):
        with pytest.raises(PermissionError):
            await device.write_attribute_value("humidity", 12)

    @pytest.mark.asyncio
    async def test_write_confirm_early_return_when_value_already_in_cache(
        self, mock_transport_client, driver
    ):
        """Cache already holds the expected value — confirm returns without polling."""
        device = CoreDevice.from_base(
            DeviceBase(id="d1", name="My pull device", config={"some_id": "abcd"}),
            driver=driver,
            transport=mock_transport_client,
            initial_values={"temperature_setpoint": 20},
        )
        mock_transport_client.write = AsyncMock()
        mock_transport_client.read = AsyncMock(return_value=20)
        await device.write_attribute_value("temperature_setpoint", 20, confirm=True)
        mock_transport_client.read.assert_not_called()

    @pytest.mark.asyncio
    async def test_write_confirm_succeeds_via_push_update(
        self, mock_push_transport_client
    ):
        """Push update arriving during confirmation window avoids active read."""
        driver = Driver(
            metadata=DriverMetadata(id="push_write_driver"),
            env={},
            device_config_required=[],
            transport=TransportProtocols.MQTT,
            update_strategy=UpdateStrategy(),
            attributes={
                "output": AttributeDriver(
                    name="output",
                    data_type=DataType.FLOAT,
                    read={"topic": "/dev/output"},
                    write={"topic": "/dev/output"},
                    codecs=[CodecSpec(name="identity", argument="")],
                ),
            },
        )
        device = CoreDevice.from_base(
            DeviceBase(id="push_write_dev", name="Push Write Device", config={}),
            driver=driver,
            transport=mock_push_transport_client,
        )
        await device.init_listeners()
        mock_push_transport_client.write = AsyncMock()
        mock_push_transport_client.read = AsyncMock(
            side_effect=TimeoutError("command-only GA")
        )

        async def deliver_push() -> None:
            await asyncio.sleep(0.1)
            await mock_push_transport_client.simulate_event("/dev/output", 25.0)

        task = asyncio.create_task(deliver_push())
        await device.write_attribute_value("output", 25.0, confirm=True)
        await task

        mock_push_transport_client.read.assert_not_called()
        assert device.attributes["output"].current_value == 25.0

    @pytest.mark.asyncio
    async def test_write_confirm_raises_when_no_push_and_read_fails(
        self, mock_push_transport_client
    ):
        """ConfirmationError is raised when push never arrives and active read fails."""
        driver = Driver(
            metadata=DriverMetadata(id="push_cmd_only_driver"),
            env={},
            device_config_required=[],
            transport=TransportProtocols.MQTT,
            update_strategy=UpdateStrategy(),
            attributes={
                "output": AttributeDriver(
                    name="output",
                    data_type=DataType.FLOAT,
                    read={"topic": "/dev/output"},
                    write={"topic": "/dev/output"},
                    codecs=[CodecSpec(name="identity", argument="")],
                ),
            },
        )
        device = CoreDevice.from_base(
            DeviceBase(
                id="push_write_fail_dev", name="Push Write Fail Device", config={}
            ),
            driver=driver,
            transport=mock_push_transport_client,
        )
        mock_push_transport_client.write = AsyncMock()
        mock_push_transport_client.read = AsyncMock(
            side_effect=TimeoutError("command-only GA")
        )

        with pytest.raises(ConfirmationError):
            await device.write_attribute_value(
                "output", 25.0, confirm=True, confirm_timeout=0.5
            )
        mock_push_transport_client.read.assert_called()


class TestDevicesListeners:
    @pytest.mark.asyncio
    async def test_devices_updates_on_listen(
        self, device_w_push_transport: CoreDevice, mock_push_transport_client
    ):
        assert device_w_push_transport.attributes["temperature"].current_value is None
        await device_w_push_transport.init_listeners()
        # Simulate transport reading a value
        await mock_push_transport_client.simulate_event(
            "/xx/temperature", {"payload": {"temperature": 25}}
        )
        assert device_w_push_transport.attributes["temperature"].current_value == 25

    @pytest.mark.asyncio
    async def test_listeners_update_their_own_attribute(
        self, mock_push_transport_client
    ):
        """Regression: each listener must update its own attribute, not the last one."""

        driver = Driver(
            metadata=DriverMetadata(id="multi_attr_push"),
            env={},
            device_config_required=[],
            transport=TransportProtocols.MQTT,
            update_strategy=UpdateStrategy(),
            attributes={
                "temperature": AttributeDriver(
                    name="temperature",
                    data_type=DataType.FLOAT,
                    read={"topic": "/dev/temperature"},
                    write=None,
                    codecs=[
                        CodecSpec(name="json_pointer", argument="/payload/temperature")
                    ],
                ),
                "humidity": AttributeDriver(
                    name="humidity",
                    data_type=DataType.FLOAT,
                    read={"topic": "/dev/humidity"},
                    write=None,
                    codecs=[
                        CodecSpec(name="json_pointer", argument="/payload/humidity")
                    ],
                ),
            },
        )
        device = CoreDevice.from_base(
            DeviceBase(id="d3", name="Multi-attr push device", config={}),
            driver=driver,
            transport=mock_push_transport_client,
        )
        await device.init_listeners()

        await mock_push_transport_client.simulate_event(
            "/dev/temperature", {"payload": {"temperature": 22.5}}
        )
        await mock_push_transport_client.simulate_event(
            "/dev/humidity", {"payload": {"humidity": 65.0}}
        )

        assert device.attributes["temperature"].current_value == 22.5
        assert device.attributes["humidity"].current_value == 65.0

    @pytest.mark.asyncio
    async def test_partial_and_irrelevant_frames_do_not_degrade(
        self, mock_push_transport_client
    ):
        """Best-effort push: frames missing attributes (or carrying none) stay ok."""
        driver = Driver(
            metadata=DriverMetadata(id="partial_push"),
            env={},
            device_config_required=[],
            transport=TransportProtocols.MQTT,
            update_strategy=UpdateStrategy(),
            attributes={
                "temperature": AttributeDriver(
                    name="temperature",
                    data_type=DataType.FLOAT,
                    read={"topic": "/dev/up"},
                    write=None,
                    codecs=[CodecSpec(name="json_pointer", argument="/temperature")],
                ),
                "battery": AttributeDriver(
                    name="battery",
                    data_type=DataType.FLOAT,
                    read={"topic": "/dev/up"},
                    write=None,
                    codecs=[CodecSpec(name="json_pointer", argument="/battery")],
                ),
            },
        )
        device = CoreDevice.from_base(
            DeviceBase(id="d4", name="Partial-frame device", config={}),
            driver=driver,
            transport=mock_push_transport_client,
        )
        await device.init_listeners()

        # Partial frame: carries temperature but not battery.
        await mock_push_transport_client.simulate_event(
            "/dev/up", {"temperature": 22.5}
        )
        # Irrelevant frame: a downlink ACK carrying none of our attributes.
        await mock_push_transport_client.simulate_event(
            "/dev/up", {"ans": [{"id": 1, "result": 0}]}
        )

        assert device.attributes["temperature"].current_value == 22.5
        assert device.attributes["battery"].current_value is None
        # A decode miss is a non-error: the frame proves the device is alive.
        assert all(e.status == "ok" for e in device.attributes["battery"].logs.listen)
        assert (
            device.attributes[CONNECTION_STATUS_ATTR].current_value
            == ConnectionStatus.OK
        )

        # A later frame carrying the previously-absent attribute updates it.
        await mock_push_transport_client.simulate_event("/dev/up", {"battery": 87.0})
        assert device.attributes["battery"].current_value == 87.0
        assert device.attributes["temperature"].current_value == 22.5

    @pytest.mark.asyncio
    async def test_on_update_fires_only_on_value_change_pull(
        self, device: CoreDevice, mock_transport_client
    ):
        """Regression AGR-534: callback must fire only when value changes."""
        calls: list[tuple[str, object]] = []
        device.on_update = lambda _d, name, _prev, attr: calls.append(
            (name, attr.current_value)
        )

        mock_transport_client.read = AsyncMock(return_value=25.5)
        await device.read_attribute_value("temperature")
        await device.read_attribute_value("temperature")
        mock_transport_client.read = AsyncMock(return_value=26.0)
        await device.read_attribute_value("temperature")

        # connection_status transitions idle→ok on the first successful read,
        # then stays ok for subsequent reads (no duplicate on_update).
        assert calls == [
            ("temperature", 25.5),
            (CONNECTION_STATUS_ATTR, "ok"),
            ("temperature", 26.0),
        ]

    @pytest.mark.asyncio
    async def test_on_update_fires_only_on_value_change_push(
        self,
        device_w_push_transport: CoreDevice,
        mock_push_transport_client,
    ):
        """Regression AGR-534: push listener must fire callback only on changes."""
        calls: list[tuple[str, object]] = []
        device_w_push_transport.on_update = lambda _d, name, _prev, attr: calls.append(
            (name, attr.current_value)
        )
        await device_w_push_transport.init_listeners()

        await mock_push_transport_client.simulate_event(
            "/xx/temperature", {"payload": {"temperature": 25}}
        )
        await mock_push_transport_client.simulate_event(
            "/xx/temperature", {"payload": {"temperature": 25}}
        )
        await mock_push_transport_client.simulate_event(
            "/xx/temperature", {"payload": {"temperature": 26}}
        )

        # connection_status transitions idle→ok on the first successful listen event,
        # then stays ok for subsequent events (no duplicate on_update).
        assert calls == [
            ("temperature", 25),
            (CONNECTION_STATUS_ATTR, "ok"),
            ("temperature", 26),
        ]


class TestCoreDeviceCanWrite:
    def test_writable_attribute_returns_true(self, device: CoreDevice):
        assert device.can_write("temperature_setpoint") is True

    def test_read_only_attribute_returns_false(self, device: CoreDevice):
        assert device.can_write("temperature") is False

    def test_unknown_attribute_returns_false(self, device: CoreDevice):
        assert device.can_write("nonexistent") is False

    def test_writable_with_matching_data_type(self, device: CoreDevice):
        assert (
            device.can_write("temperature_setpoint", data_type=DataType.FLOAT) is True
        )


class TestEventLogWiring:
    @pytest.mark.asyncio
    async def test_read_appends_log(self, device: CoreDevice, mock_transport_client):
        mock_transport_client.read = AsyncMock(return_value="25.5")
        await device.read_attribute_value("temperature")
        assert len(device.attributes["temperature"].logs.read) == 1
        assert device.attributes["temperature"].logs.read[0].status == "ok"

    @pytest.mark.asyncio
    async def test_write_appends_log(self, device: CoreDevice, mock_transport_client):
        mock_transport_client.read = AsyncMock(return_value="22.0")
        await device.write_attribute_value("temperature_setpoint", 22.0, confirm=False)
        assert len(device.attributes["temperature_setpoint"].logs.write) == 1
        assert device.attributes["temperature_setpoint"].logs.write[0].status == "ok"

    @pytest.mark.asyncio
    async def test_listen_appends_log(
        self, device_w_push_transport: CoreDevice, mock_push_transport_client
    ):
        await device_w_push_transport.init_listeners()
        await mock_push_transport_client.simulate_event(
            "/xx/temperature", {"payload": {"temperature": 25.0}}
        )
        listen_logs = device_w_push_transport.attributes["temperature"].logs.listen
        assert len(listen_logs) == 1
        assert listen_logs[0].status == "ok"

    def test_writable_with_mismatched_data_type(self, device: CoreDevice):
        assert (
            device.can_write("temperature_setpoint", data_type=DataType.BOOL) is False
        )

    def test_data_type_ignored_when_none(self, device: CoreDevice):
        assert device.can_write("temperature_setpoint", data_type=None) is True


class TestDeviceEquality:
    def test_device_equals_to_itself(self, device: CoreDevice):
        assert device == device  # noqa: PLR0124

    def test_device_equals_same_configs(self, mock_transport_client, driver):
        device_1 = CoreDevice.from_base(
            DeviceBase(id="xxx", name="My device", config={"some_id": "abcd"}),
            driver=driver,
            transport=mock_transport_client,
        )
        device_2 = CoreDevice.from_base(
            DeviceBase(id="xxx", name="My device", config={"some_id": "abcd"}),
            driver=driver,
            transport=mock_transport_client,
        )
        assert device_1 == device_2

    def test_device_not_equals_different_configs(self, mock_transport_client, driver):
        device_1 = CoreDevice.from_base(
            DeviceBase(id="xxx", name="My device", config={"some_id": "abcd"}),
            driver=driver,
            transport=mock_transport_client,
        )
        device_2 = CoreDevice.from_base(
            DeviceBase(id="xxx", name="My device", config={"some_id": "xyz"}),
            driver=driver,
            transport=mock_transport_client,
        )
        assert device_1 != device_2


class TestCoreDeviceAttributeFactory:
    """CoreDevice.from_base picks Attribute or FaultAttribute per driver."""

    @pytest.fixture
    def fault_driver(self) -> Driver:
        alarm = FaultAttributeDriver(
            name="alarm",
            data_type=DataType.BOOL,
            read="GET /alarm",
            write=None,
            codecs=[CodecSpec(name="identity", argument="")],
            healthy_values=[False],
            severity=Severity.ALERT,
        )
        temp = AttributeDriver(
            name="temperature",
            data_type=DataType.FLOAT,
            read="GET /temp",
            write=None,
            codecs=[CodecSpec(name="identity", argument="")],
        )
        return Driver(
            metadata=DriverMetadata(id="mixed_driver"),
            env={},
            transport=TransportProtocols.HTTP,
            device_config_required=[],
            update_strategy=UpdateStrategy(),
            attributes={alarm.name: alarm, temp.name: temp},
        )

    def test_fault_driver_produces_fault_attribute(
        self,
        mock_transport_client: TransportClient,
        fault_driver: Driver,
    ):
        device = CoreDevice.from_base(
            DeviceBase(id="d", name="mixed", config={}),
            driver=fault_driver,
            transport=mock_transport_client,
        )
        alarm = device.attributes["alarm"]
        assert isinstance(alarm, FaultAttribute)
        assert alarm.healthy_values == [False]
        assert alarm.severity == Severity.ALERT

    def test_standard_driver_produces_plain_attribute(
        self,
        mock_transport_client: TransportClient,
        fault_driver: Driver,
    ):
        device = CoreDevice.from_base(
            DeviceBase(id="d", name="mixed", config={}),
            driver=fault_driver,
            transport=mock_transport_client,
        )
        temp = device.attributes["temperature"]
        assert type(temp) is Attribute

    def test_fault_attribute_is_faulty_derives_from_initial_value(
        self,
        mock_transport_client: TransportClient,
        fault_driver: Driver,
    ):
        device = CoreDevice.from_base(
            DeviceBase(id="d", name="mixed", config={}),
            driver=fault_driver,
            transport=mock_transport_client,
            initial_values={"alarm": True},
        )
        alarm = device.attributes["alarm"]
        assert isinstance(alarm, FaultAttribute)
        assert alarm.is_faulty is True

    def test_fault_attribute_is_faulty_false_when_no_initial_value(
        self,
        mock_transport_client: TransportClient,
        fault_driver: Driver,
    ):
        device = CoreDevice.from_base(
            DeviceBase(id="d", name="mixed", config={}),
            driver=fault_driver,
            transport=mock_transport_client,
        )
        alarm = device.attributes["alarm"]
        assert isinstance(alarm, FaultAttribute)
        assert alarm.current_value is None
        assert alarm.is_faulty is False

    def test_restored_timestamps_are_used_instead_of_now(
        self,
        mock_transport_client: TransportClient,
        fault_driver: Driver,
    ):
        """Regression AGR-887: from_base must not stamp restored state with now()."""
        old = datetime(2020, 1, 1, tzinfo=UTC)
        device = CoreDevice.from_base(
            DeviceBase(id="d", name="mixed", config={}),
            driver=fault_driver,
            transport=mock_transport_client,
            restored_attributes={
                "temperature": Attribute(
                    name="temperature",
                    data_type=DataType.FLOAT,
                    read_write_modes={"read"},
                    current_value=21.0,
                    last_updated=old,
                    last_changed=old,
                )
            },
        )
        temp = device.attributes["temperature"]
        assert temp.current_value == 21.0
        assert temp.last_updated == old
        assert temp.last_changed == old

    def test_partial_restored_timestamps_are_not_dropped(
        self,
        mock_transport_client: TransportClient,
        fault_driver: Driver,
    ):
        """Regression AGR-887: a restored attribute with only one timestamp set
        (e.g. never changed since first update) must not be re-stamped with
        now() for either field."""
        old = datetime(2020, 1, 1, tzinfo=UTC)
        device = CoreDevice.from_base(
            DeviceBase(id="d", name="mixed", config={}),
            driver=fault_driver,
            transport=mock_transport_client,
            restored_attributes={
                "temperature": Attribute(
                    name="temperature",
                    data_type=DataType.FLOAT,
                    read_write_modes={"read"},
                    current_value=21.0,
                    last_updated=old,
                    last_changed=None,
                )
            },
        )
        temp = device.attributes["temperature"]
        assert temp.current_value == 21.0
        assert temp.last_updated == old
        assert temp.last_changed is None

    def test_no_restored_timestamps_stamps_now(
        self,
        mock_transport_client: TransportClient,
        fault_driver: Driver,
    ):
        """A genuinely new value (no restore data) still gets stamped now()."""
        before = datetime.now(UTC)
        device = CoreDevice.from_base(
            DeviceBase(id="d", name="mixed", config={}),
            driver=fault_driver,
            transport=mock_transport_client,
            initial_values={"temperature": 21.0},
        )
        temp = device.attributes["temperature"]
        assert temp.last_updated is not None
        assert temp.last_updated >= before

    def test_fault_attribute_restores_timestamps(
        self,
        mock_transport_client: TransportClient,
        fault_driver: Driver,
    ):
        """Regression AGR-887: the FaultAttribute branch restores timestamps too —
        this is the ticket's reproduction scenario (fault age lost on reboot)."""
        old = datetime(2020, 1, 1, tzinfo=UTC)
        device = CoreDevice.from_base(
            DeviceBase(id="d", name="mixed", config={}),
            driver=fault_driver,
            transport=mock_transport_client,
            restored_attributes={
                "alarm": FaultAttribute(
                    name="alarm",
                    data_type=DataType.BOOL,
                    read_write_modes={"read"},
                    current_value=True,
                    last_updated=old,
                    last_changed=old,
                    healthy_values=[False],
                    severity=Severity.ALERT,
                )
            },
        )
        alarm = device.attributes["alarm"]
        assert isinstance(alarm, FaultAttribute)
        assert alarm.current_value is True
        assert alarm.last_updated == old
        assert alarm.last_changed == old


class TestCoreDeviceRebuildAttribute:
    """CoreDevice.rebuild_attribute preserves value and timestamps."""

    def test_preserves_value_and_timestamps(self, device: CoreDevice):
        device.attributes["temperature"].update_value(25.5)
        original = device.attributes["temperature"]
        attribute_driver = device.driver.attributes["temperature"]

        device.rebuild_attribute(attribute_driver)

        rebuilt = device.attributes["temperature"]
        assert rebuilt.current_value == 25.5
        assert rebuilt.last_updated == original.last_updated
        assert rebuilt.last_changed == original.last_changed

    def test_new_attribute_has_no_timestamps(self, device: CoreDevice):
        """An attribute with no prior state starts fresh (no backdating)."""
        attribute_driver = device.driver.attributes["temperature"]
        device.delete_attribute("temperature")

        device.rebuild_attribute(attribute_driver)

        rebuilt = device.attributes["temperature"]
        assert rebuilt.current_value is None
        assert rebuilt.last_updated is None
        assert rebuilt.last_changed is None


class TestCoreDeviceWaiters:
    @pytest.mark.asyncio
    async def test_waiter_fires_when_predicate_matches(
        self, device: CoreDevice, mock_transport_client
    ):
        mock_transport_client.read = AsyncMock(return_value=25.0)
        async with device.wait_for_attribute(
            "temperature", lambda v: v == 25.0
        ) as event:
            await device.read_attribute_value("temperature")
            assert event.is_set()

    @pytest.mark.asyncio
    async def test_waiter_not_fired_when_predicate_misses(
        self, device: CoreDevice, mock_transport_client
    ):
        mock_transport_client.read = AsyncMock(return_value=20.0)
        async with device.wait_for_attribute(
            "temperature", lambda v: v == 25.0
        ) as event:
            await device.read_attribute_value("temperature")
            assert not event.is_set()

    @pytest.mark.asyncio
    async def test_waiter_not_fired_for_different_attribute(
        self, device: CoreDevice, mock_transport_client
    ):
        mock_transport_client.read = AsyncMock(return_value=25.0)
        async with device.wait_for_attribute(
            "temperature", lambda v: v == 25.0
        ) as event:
            await device.read_attribute_value("temperature_setpoint")
            assert not event.is_set()

    @pytest.mark.asyncio
    async def test_multiple_waiters_only_matching_fires(
        self, device: CoreDevice, mock_transport_client
    ):
        mock_transport_client.read = AsyncMock(return_value=25.0)
        async with (
            device.wait_for_attribute("temperature", lambda v: v == 25.0) as ev25,
            device.wait_for_attribute("temperature", lambda v: v == 30.0) as ev30,
        ):
            await device.read_attribute_value("temperature")
            assert ev25.is_set()
            assert not ev30.is_set()

    @pytest.mark.asyncio
    async def test_waiter_cleaned_up_after_normal_exit(
        self, device: CoreDevice, mock_transport_client
    ):
        async with device.wait_for_attribute(
            "temperature", lambda v: v == 25.0
        ) as event:
            pass
        mock_transport_client.read = AsyncMock(return_value=25.0)
        await device.read_attribute_value("temperature")
        assert not event.is_set()

    @pytest.mark.asyncio
    async def test_waiter_cleaned_up_after_cancellation(
        self, device: CoreDevice, mock_transport_client
    ):
        captured: list[asyncio.Event] = []

        async def cancellable() -> None:
            async with device.wait_for_attribute(
                "temperature", lambda v: v == 25.0
            ) as event:
                captured.append(event)
                await asyncio.sleep(10)

        task = asyncio.create_task(cancellable())
        await asyncio.sleep(0)
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
        mock_transport_client.read = AsyncMock(return_value=25.0)
        await device.read_attribute_value("temperature")
        assert not captured[0].is_set()

    @pytest.mark.asyncio
    async def test_push_update_fires_waiter(
        self, device_w_push_transport: CoreDevice, mock_push_transport_client
    ):
        """Push listener path through _update_attribute fires the waiter."""
        await device_w_push_transport.init_listeners()
        async with device_w_push_transport.wait_for_attribute(
            "temperature", lambda v: v == 22.0
        ) as event:
            await mock_push_transport_client.simulate_event(
                "/xx/temperature", {"payload": {"temperature": 22}}
            )
            assert event.is_set()


@pytest.fixture
def shared_address_driver() -> Driver:
    shared_read = "GET /shared"
    attrs = [
        AttributeDriver(
            name="a",
            data_type=DataType.FLOAT,
            read=shared_read,
            write=None,
            codecs=[CodecSpec(name="identity", argument="")],
        ),
        AttributeDriver(
            name="b",
            data_type=DataType.FLOAT,
            read=shared_read,
            write=None,
            codecs=[CodecSpec(name="identity", argument="")],
        ),
    ]
    return Driver(
        metadata=DriverMetadata(id="shared_driver"),
        env={},
        transport=TransportProtocols.HTTP,
        device_config_required=[],
        update_strategy=UpdateStrategy(),
        attributes={attr.name: attr for attr in attrs},
    )


class TestSweepReadCache:
    @pytest.mark.asyncio
    async def test_shared_address_reads_once_per_sweep(
        self, mock_transport_client, shared_address_driver
    ):
        device = CoreDevice.from_base(
            DeviceBase(id="d", name="shared", config={}),
            driver=shared_address_driver,
            transport=mock_transport_client,
        )
        read_spy = AsyncMock(return_value=1.0)
        mock_transport_client._read = read_spy  # noqa: SLF001

        await device.update_attributes()
        assert read_spy.call_count == 1

        await device.update_attributes()
        assert read_spy.call_count == 2

    @pytest.mark.asyncio
    async def test_confirm_read_back_bypasses_sweep_cache(
        self, device: CoreDevice, mock_transport_client
    ):
        correlation_ids: list[str | None] = []

        async def recording_read(
            address: MockTransportAddress, correlation_id: str | None = None
        ) -> object:
            correlation_ids.append(correlation_id)
            return await TransportClient.read(
                mock_transport_client, address, correlation_id
            )

        mock_transport_client.read = recording_read

        mock_transport_client._read = AsyncMock(return_value=10)  # noqa: SLF001
        await device.update_attributes()

        mock_transport_client.write = AsyncMock()
        mock_transport_client._read = AsyncMock(return_value=20)  # noqa: SLF001
        await device.write_attribute_value("temperature_setpoint", 20, confirm=True)

        assert device.get_attribute_value("temperature_setpoint") == 20
        assert None in correlation_ids
        assert any(cid is not None for cid in correlation_ids)
