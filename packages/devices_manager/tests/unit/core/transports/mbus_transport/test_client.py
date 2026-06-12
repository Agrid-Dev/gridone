import decimal
from unittest.mock import MagicMock

import meterbus
import pytest
import serial

from devices_manager.core.transports.mbus_transport import (
    MBusTransportClient,
    MBusTransportConfig,
)
from devices_manager.core.transports.mbus_transport.mbus_address import MBusAddress
from devices_manager.core.transports.transport_metadata import TransportMetadata

pytestmark = pytest.mark.asyncio


@pytest.fixture
def client() -> MBusTransportClient:
    return MBusTransportClient(
        TransportMetadata(id="t1", name="M1"),
        MBusTransportConfig(host="gw.local", port=10001),
    )


@pytest.fixture
def fake_serial(monkeypatch: pytest.MonkeyPatch) -> MagicMock:
    """Replace serial_for_url so connect() never touches the network."""
    fake = MagicMock()
    monkeypatch.setattr(serial, "serial_for_url", MagicMock(return_value=fake))
    return fake


def _patch_telegram(monkeypatch: pytest.MonkeyPatch, records: list[object]) -> None:
    monkeypatch.setattr(meterbus, "send_request_frame", MagicMock())
    monkeypatch.setattr(meterbus, "recv_frame", MagicMock(return_value=b"\x68data"))
    monkeypatch.setattr(
        meterbus, "load", MagicMock(return_value=MagicMock(records=records))
    )


async def test_connect_opens_rfc2217_url(
    client: MBusTransportClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    spy = MagicMock(return_value=MagicMock())
    monkeypatch.setattr(serial, "serial_for_url", spy)

    await client.connect()

    url, kwargs = spy.call_args.args[0], spy.call_args.kwargs
    assert url == "rfc2217://gw.local:10001"
    assert kwargs["baudrate"] == 2400
    assert client.connection_state.is_connected


@pytest.mark.usefixtures("fake_serial")
async def test_read_returns_float_of_indexed_record(
    client: MBusTransportClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    target = MagicMock(parsed_value=decimal.Decimal(69000))
    _patch_telegram(monkeypatch, records=[MagicMock(), target])

    value = await client.read(MBusAddress(primary_address=1, record_index=1))

    assert value == 69000.0
    assert isinstance(value, float)


@pytest.mark.usefixtures("fake_serial")
async def test_read_raises_when_no_frame_received(
    client: MBusTransportClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(meterbus, "send_request_frame", MagicMock())
    monkeypatch.setattr(meterbus, "recv_frame", MagicMock(return_value=b""))

    with pytest.raises(ConnectionError):
        await client.read(MBusAddress(primary_address=9, record_index=0))


async def test_close_closes_serial(
    client: MBusTransportClient, fake_serial: MagicMock
) -> None:
    await client.connect()
    await client.close()

    fake_serial.close.assert_called_once()
    assert not client.connection_state.is_connected


async def test_write_raises_not_implemented(client: MBusTransportClient) -> None:
    with pytest.raises(NotImplementedError):
        await client.write(MBusAddress(primary_address=1, record_index=0), 1.0)
