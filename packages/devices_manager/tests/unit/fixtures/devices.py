import pytest
from devices_manager import Driver, TransportClient
from devices_manager.device import Device, DeviceBase


@pytest.fixture
def device_base() -> DeviceBase:
    return DeviceBase(id="d1", name="My device", config={"some_id": "abc"})


@pytest.fixture
def push_device_base() -> DeviceBase:
    return DeviceBase(id="d2", name="My push device", config={"some_id": "xyz"})


@pytest.fixture
def device(
    device_base: DeviceBase, driver: Driver, mock_transport_client: TransportClient
) -> Device:
    return Device.from_base(
        base=device_base, driver=driver, transport=mock_transport_client
    )


@pytest.fixture
def push_device(
    push_device_base: DeviceBase,
    driver_w_push_transport: Driver,
    mock_push_transport_client: TransportClient,
) -> Device:
    return Device.from_base(
        base=push_device_base,
        driver=driver_w_push_transport,
        transport=mock_push_transport_client,
    )
