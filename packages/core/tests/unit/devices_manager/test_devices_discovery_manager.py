import pytest
from core.device import Device
from core.devices_manager.devices_discovery_manager import DevicesDiscoveryManager


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


@pytest.mark.asyncio
async def test_register_discovery_accepts_only_push_transport_client(
    driver_w_push_transport, mock_transport_client, on_discover_spy
):
    ddm = DevicesDiscoveryManager()
    with pytest.raises(TypeError):
        await ddm.register_discovery(
            driver_w_push_transport, mock_transport_client, on_discover_spy.call
        )


@pytest.mark.asyncio
async def test_register_discovery_driver_must_support_discovery(
    driver, mock_push_transport_client, on_discover_spy
):
    ddm = DevicesDiscoveryManager()
    with pytest.raises(TypeError):
        await ddm.register_discovery(
            driver, mock_push_transport_client, on_discover_spy.call
        )


@pytest.mark.asyncio
async def test_fires_callback_on_discover(
    driver_w_push_transport, mock_push_transport_client, on_discover_spy
):
    ddm = DevicesDiscoveryManager()
    await ddm.register_discovery(
        driver_w_push_transport, mock_push_transport_client, on_discover_spy.call
    )
    await mock_push_transport_client.simulate_event(
        "/xx",
        {"id": "abc", "gateway_id": "gtw", "payload": {"temperature": 22}},
    )
    assert on_discover_spy.call_count == 1


@pytest.mark.asyncio
async def test_fires_only_once_for_same_payload(
    driver_w_push_transport, mock_push_transport_client, on_discover_spy
):
    ddm = DevicesDiscoveryManager()
    await ddm.register_discovery(
        driver_w_push_transport, mock_push_transport_client, on_discover_spy.call
    )
    for i in range(3):
        await mock_push_transport_client.simulate_event(
            "/xx",
            {"id": "abc", "gateway_id": "gtw", "payload": {"temperature": 22 + i}},
        )

    assert on_discover_spy.call_count == 1


@pytest.mark.asyncio
async def test_unregister_unexisting_discovery():
    ddm = DevicesDiscoveryManager()
    with pytest.raises(KeyError):
        await ddm.unregister_discovery("driver_id", "transport_id")


@pytest.mark.asyncio
async def test_callback_not_fired_after_unregister(
    driver_w_push_transport, mock_push_transport_client, on_discover_spy
):
    ddm = DevicesDiscoveryManager()
    await ddm.register_discovery(
        driver_w_push_transport, mock_push_transport_client, on_discover_spy.call
    )
    await ddm.unregister_discovery(
        driver_w_push_transport.metadata.id, mock_push_transport_client.id
    )
    await mock_push_transport_client.simulate_event(
        "/xx",
        {"id": "abc", "gateway_id": "gtw", "payload": {"temperature": 22}},
    )
    assert on_discover_spy.call_count == 0


@pytest.mark.asyncio
async def tests_callback_called_with_actual_device(
    driver_w_push_transport, mock_push_transport_client, on_discover_spy
):
    ddm = DevicesDiscoveryManager()
    await ddm.register_discovery(
        driver_w_push_transport, mock_push_transport_client, on_discover_spy.call
    )
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
async def tests_list(
    driver_w_push_transport, mock_push_transport_client, on_discover_spy
):
    ddm = DevicesDiscoveryManager()
    await ddm.register_discovery(
        driver_w_push_transport, mock_push_transport_client, on_discover_spy.call
    )
    configs = ddm.list()
    assert len(configs) == 1
    config = configs[0]
    assert config["driver_id"] == driver_w_push_transport.id
    assert config["transport_id"] == mock_push_transport_client.id


@pytest.mark.asyncio
async def tests_list_with_filter(
    driver_w_push_transport, mock_push_transport_client, on_discover_spy
):
    ddm = DevicesDiscoveryManager()

    await ddm.register_discovery(
        driver_w_push_transport, mock_push_transport_client, on_discover_spy.call
    )
    configs = ddm.list(driver_id=driver_w_push_transport.id)
    assert len(configs) == 1
    config = configs[0]
    assert config["driver_id"] == driver_w_push_transport.id
    assert config["transport_id"] == mock_push_transport_client.id

    other_d = ddm.list(driver_id="other")
    assert len(other_d) == 0
    other_t = ddm.list(transport_id="other")
    assert len(other_t) == 0
