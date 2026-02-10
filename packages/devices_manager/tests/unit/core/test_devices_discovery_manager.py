import pytest
from devices_manager.core.device import Device
from devices_manager.core.discovery_manager import (
    DevicesDiscoveryManager,
    DiscoveryContext,
)
from devices_manager.core.driver import Driver
from devices_manager.core.transports import TransportClient


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
def add_device_spy() -> FnCallSpy:
    return FnCallSpy()


DEVICE_EXISTS_CONFIG = {"id": "abc", "gateway_id": "gtw"}


@pytest.fixture
def discovery_context(
    driver_w_push_transport, mock_push_transport_client, add_device_spy
) -> DiscoveryContext:
    def get_driver(driver_id: str) -> Driver:
        drivers = {driver_w_push_transport.id: driver_w_push_transport}
        return drivers[driver_id]

    def get_transport(transport_id: str) -> TransportClient:
        transports = {mock_push_transport_client.id: mock_push_transport_client}
        return transports[transport_id]

    def device_exists(device: Device) -> bool:
        return device.config == DEVICE_EXISTS_CONFIG

    return DiscoveryContext(
        get_driver=get_driver,
        get_transport=get_transport,
        device_exists=device_exists,
        add_device=add_device_spy.call,
    )


@pytest.mark.asyncio
async def test_unregister_unexisting_discovery(discovery_context):
    ddm = DevicesDiscoveryManager(discovery_context)
    with pytest.raises(KeyError):
        await ddm.unregister("driver_id", "transport_id")


@pytest.mark.asyncio
async def test_register_fails_driver_not_found(
    discovery_context, mock_push_transport_client
):
    ddm = DevicesDiscoveryManager(discovery_context)
    with pytest.raises(KeyError):
        await ddm.register("unknown_driver", mock_push_transport_client.id)


@pytest.mark.asyncio
async def test_register_fails_transport_not_found(
    discovery_context, driver_w_push_transport
):
    ddm = DevicesDiscoveryManager(discovery_context)
    with pytest.raises(KeyError):
        await ddm.register(driver_w_push_transport.id, "unknown transport")


@pytest.mark.asyncio
async def test_register_fails_discovery_exists(
    discovery_context, driver_w_push_transport, mock_push_transport_client
):
    ddm = DevicesDiscoveryManager(discovery_context)
    await ddm.register(driver_w_push_transport.id, mock_push_transport_client.id)
    with pytest.raises(ValueError):  # noqa: PT011
        await ddm.register(driver_w_push_transport.id, mock_push_transport_client.id)


@pytest.mark.asyncio
async def test_callback_not_fired_after_unregister(
    discovery_context,
    driver_w_push_transport,
    mock_push_transport_client,
    add_device_spy,
):
    ddm = DevicesDiscoveryManager(discovery_context)
    await ddm.register(driver_w_push_transport.id, mock_push_transport_client.id)
    await ddm.unregister(
        driver_w_push_transport.metadata.id, mock_push_transport_client.id
    )
    await mock_push_transport_client.simulate_event(
        "/xx",
        {"id": "abc", "gateway_id": "gtw", "payload": {"temperature": 22}},
    )
    assert add_device_spy.call_count == 0


@pytest.mark.asyncio
async def tests_list(
    discovery_context,
    driver_w_push_transport,
    mock_push_transport_client,
):
    ddm = DevicesDiscoveryManager(discovery_context)
    await ddm.register(driver_w_push_transport.id, mock_push_transport_client.id)
    configs = ddm.list()
    assert len(configs) == 1
    config = configs[0]
    assert config["driver_id"] == driver_w_push_transport.id
    assert config["transport_id"] == mock_push_transport_client.id


@pytest.mark.asyncio
async def tests_list_with_filter(
    discovery_context,
    driver_w_push_transport,
    mock_push_transport_client,
):
    ddm = DevicesDiscoveryManager(discovery_context)

    await ddm.register(driver_w_push_transport.id, mock_push_transport_client.id)
    configs = ddm.list(driver_id=driver_w_push_transport.id)
    assert len(configs) == 1
    config = configs[0]
    assert config["driver_id"] == driver_w_push_transport.id
    assert config["transport_id"] == mock_push_transport_client.id

    other_d = ddm.list(driver_id="other")
    assert len(other_d) == 0
    other_t = ddm.list(transport_id="other")
    assert len(other_t) == 0


@pytest.mark.asyncio
async def tests_has(
    discovery_context,
    driver_w_push_transport,
    mock_push_transport_client,
):
    ddm = DevicesDiscoveryManager(discovery_context)

    await ddm.register(driver_w_push_transport.id, mock_push_transport_client.id)
    assert ddm.has(driver_w_push_transport.id, mock_push_transport_client.id)
    assert not ddm.has("unknown", mock_push_transport_client.id)
    assert not ddm.has(driver_w_push_transport.id, "unknown")
    assert not ddm.has("unknown", "unknown")
