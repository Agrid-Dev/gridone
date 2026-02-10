import pytest
from devices_manager.core.device import Device
from devices_manager.core.discovery_manager.discovery_handler import (
    DiscoveryHandler,
)


class FnCallSpy:
    call_args: list[Device]

    def __init__(self) -> None:
        self.call_args = []

    def call(self, device: Device):
        self.call_args.append(device)

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
    assert on_discover_spy.call_count == 1
    device = on_discover_spy.call_args[0]
    assert isinstance(device, Device)
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
    assert on_discover_spy.call_count == 1
    device: Device = on_discover_spy.call_args[0]
    assert isinstance(device, Device)
    assert device.get_attribute_value("temperature") == 22
