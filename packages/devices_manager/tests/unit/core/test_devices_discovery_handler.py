from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock

import pytest

from devices_manager.core.device import CoreDevice
from devices_manager.core.discovery_manager.discovery_handler import (
    DiscoveryHandler,
)


class FnCallSpy:
    call_args: list[CoreDevice]
    called: asyncio.Event

    def __init__(self) -> None:
        self.call_args = []
        self.called = asyncio.Event()

    async def call(self, device: CoreDevice):
        self.call_args.append(device)
        self.called.set()

    async def wait(self, timeout: float = 1.0) -> None:  # noqa: ASYNC109
        await asyncio.wait_for(self.called.wait(), timeout=timeout)

    @property
    def call_count(self) -> int:
        return len(self.call_args)


@pytest.fixture
def on_discover_spy() -> FnCallSpy:
    return FnCallSpy()


def test_accepts_only_push_transport_client(
    driver_w_push_transport, mock_transport_client, on_discover_spy
):
    with pytest.raises(TypeError):
        _ = DiscoveryHandler(
            driver_w_push_transport, mock_transport_client, on_discover_spy.call
        )


def test_driver_must_support_discovery(
    driver, mock_push_transport_client, on_discover_spy
):
    with pytest.raises(TypeError):
        _ = DiscoveryHandler(driver, mock_push_transport_client, on_discover_spy.call)


@pytest.mark.asyncio
async def test_fires_callback_on_discover(
    driver_w_push_transport, mock_push_transport_client, on_discover_spy
):
    dh = DiscoveryHandler(
        driver_w_push_transport, mock_push_transport_client, on_discover_spy.call
    )
    await dh.start()
    await mock_push_transport_client.simulate_event(
        "/xx",
        {"id": "abc", "gateway_id": "gtw", "payload": {"temperature": 22}},
    )
    await on_discover_spy.wait()
    assert on_discover_spy.call_count == 1


@pytest.mark.asyncio
async def test_fires_only_once_for_same_payload(
    driver_w_push_transport, mock_push_transport_client, on_discover_spy
):
    dh = DiscoveryHandler(
        driver_w_push_transport, mock_push_transport_client, on_discover_spy.call
    )
    await dh.start()
    for i in range(3):
        await mock_push_transport_client.simulate_event(
            "/xx",
            {"id": "abc", "gateway_id": "gtw", "payload": {"temperature": 22 + i}},
        )
    await on_discover_spy.wait()
    assert on_discover_spy.call_count == 1


@pytest.mark.asyncio
async def test_callback_not_fired_after_stop(
    driver_w_push_transport, mock_push_transport_client, on_discover_spy
):
    dh = DiscoveryHandler(
        driver_w_push_transport, mock_push_transport_client, on_discover_spy.call
    )
    await dh.start()
    await dh.stop()
    await mock_push_transport_client.simulate_event(
        "/xx",
        {"id": "abc", "gateway_id": "gtw", "payload": {"temperature": 22}},
    )
    await asyncio.sleep(0)
    assert on_discover_spy.call_count == 0


@pytest.mark.asyncio
async def tests_callback_called_with_actual_device(
    driver_w_push_transport, mock_push_transport_client, on_discover_spy
):
    dh = DiscoveryHandler(
        driver_w_push_transport, mock_push_transport_client, on_discover_spy.call
    )
    await dh.start()
    await mock_push_transport_client.simulate_event(
        "/xx",
        {"id": "abc", "gateway_id": "gtw", "payload": {"temperature": 22}},
    )
    await on_discover_spy.wait()
    assert on_discover_spy.call_count == 1
    device = on_discover_spy.call_args[0]
    assert isinstance(device, CoreDevice)
    assert isinstance(device.id, str)
    assert device.config == {"vendor_id": "abc", "gateway_id": "gtw"}


@pytest.mark.asyncio
async def tests_initializes_attributes_if_present_in_payload(
    driver_w_push_transport, mock_push_transport_client, on_discover_spy
):
    dh = DiscoveryHandler(
        driver_w_push_transport, mock_push_transport_client, on_discover_spy.call
    )
    await dh.start()
    await mock_push_transport_client.simulate_event(
        "/xx",
        {"id": "abc", "gateway_id": "gtw", "payload": {"temperature": 22}},
    )
    await on_discover_spy.wait()
    assert on_discover_spy.call_count == 1
    device: CoreDevice = on_discover_spy.call_args[0]
    assert isinstance(device, CoreDevice)
    assert device.get_attribute_value("temperature") == 22


@pytest.mark.asyncio
async def tests_initializes_name_from_config_fields(
    driver_w_push_transport, mock_push_transport_client, on_discover_spy
):
    dh = DiscoveryHandler(
        driver_w_push_transport, mock_push_transport_client, on_discover_spy.call
    )
    await dh.start()
    await mock_push_transport_client.simulate_event(
        "/xx",
        {"gateway_id": "gtw", "id": "abc", "payload": {"temperature": 22}},
    )
    await on_discover_spy.wait()
    assert on_discover_spy.call_count == 1
    device: CoreDevice = on_discover_spy.call_args[0]
    assert isinstance(device, CoreDevice)
    assert "gtw" in device.name
    assert "abc" in device.name


CONFIG_BASED_NAME = "abc/gtw"


async def _discover(driver, transport, spy) -> CoreDevice:
    dh = DiscoveryHandler(driver, transport, spy.call)
    await dh.start()
    await transport.simulate_event(
        "/xx", {"id": "abc", "gateway_id": "gtw", "payload": {"temperature": 22}}
    )
    await spy.wait()
    return spy.call_args[0]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("read_result", "expected_name"),
    [
        ({"label": "  Ch 02  "}, "Ch 02"),
        ({"label": ""}, CONFIG_BASED_NAME),
        ({"label": "   "}, CONFIG_BASED_NAME),
        ({"label": 42}, CONFIG_BASED_NAME),
        ({"label": None}, CONFIG_BASED_NAME),
        ({}, CONFIG_BASED_NAME),
        (TimeoutError("no reply"), CONFIG_BASED_NAME),
    ],
)
async def test_names_device_from_name_attribute_read_at_discovery(
    driver_w_name_attribute,
    mock_push_transport_client,
    on_discover_spy,
    read_result,
    expected_name,
):
    mock_push_transport_client._read = AsyncMock(  # noqa: SLF001
        side_effect=[read_result]
    )
    device = await _discover(
        driver_w_name_attribute, mock_push_transport_client, on_discover_spy
    )
    assert device.name == expected_name


@pytest.mark.asyncio
async def test_name_read_uses_the_attribute_address_rendered_with_config(
    driver_w_name_attribute, mock_push_transport_client, on_discover_spy
):
    mock_push_transport_client._read = AsyncMock(return_value={"label": "Ch 02"})  # noqa: SLF001
    await _discover(
        driver_w_name_attribute, mock_push_transport_client, on_discover_spy
    )
    (address,) = mock_push_transport_client._read.call_args.args  # noqa: SLF001
    assert address.topic == "/xx/abc/label"


@pytest.mark.asyncio
async def test_no_read_without_name_attribute(
    driver_w_push_transport, mock_push_transport_client, on_discover_spy
):
    mock_push_transport_client._read = AsyncMock(return_value={"label": "Ch 02"})  # noqa: SLF001
    device = await _discover(
        driver_w_push_transport, mock_push_transport_client, on_discover_spy
    )
    assert device.name == CONFIG_BASED_NAME
    mock_push_transport_client._read.assert_not_awaited()  # noqa: SLF001


EVENT = {"id": "abc", "gateway_id": "gtw", "payload": {"temperature": 22}}


def _gated_read(transport) -> asyncio.Event:
    """Make the transport's reads wait on the returned event before replying."""
    gate = asyncio.Event()

    async def read(_address: object) -> dict:
        await gate.wait()
        return {"label": "Ch 02"}

    transport._read = read  # noqa: SLF001
    return gate


@pytest.mark.asyncio
async def test_announcements_during_the_name_read_do_not_duplicate_the_device(
    driver_w_name_attribute, mock_push_transport_client, on_discover_spy
):
    gate = _gated_read(mock_push_transport_client)
    dh = DiscoveryHandler(
        driver_w_name_attribute, mock_push_transport_client, on_discover_spy.call
    )
    await dh.start()
    await mock_push_transport_client.simulate_event("/xx", EVENT)
    await asyncio.sleep(0)  # the read is now in flight
    await mock_push_transport_client.simulate_event("/xx", EVENT)
    gate.set()
    await on_discover_spy.wait()
    await asyncio.sleep(0)
    assert on_discover_spy.call_count == 1


@pytest.mark.asyncio
async def test_stop_cancels_an_in_flight_name_read(
    driver_w_name_attribute, mock_push_transport_client, on_discover_spy
):
    gate = _gated_read(mock_push_transport_client)
    dh = DiscoveryHandler(
        driver_w_name_attribute, mock_push_transport_client, on_discover_spy.call
    )
    await dh.start()
    await mock_push_transport_client.simulate_event("/xx", EVENT)
    await asyncio.sleep(0)
    await dh.stop()
    gate.set()
    await asyncio.sleep(0)
    assert on_discover_spy.call_count == 0


@pytest.mark.asyncio
async def test_failed_discovery_is_retried_on_the_next_announcement(
    driver_w_push_transport, mock_push_transport_client, on_discover_spy, caplog
):
    attempts = 0

    async def flaky_on_discover(device: CoreDevice) -> None:
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            msg = "storage down"
            raise RuntimeError(msg)
        await on_discover_spy.call(device)

    dh = DiscoveryHandler(
        driver_w_push_transport, mock_push_transport_client, flaky_on_discover
    )
    await dh.start()
    await mock_push_transport_client.simulate_event("/xx", EVENT)
    await asyncio.sleep(0)
    await mock_push_transport_client.simulate_event("/xx", EVENT)
    await on_discover_spy.wait()
    assert attempts == 2
    assert "storage down" in caplog.text
