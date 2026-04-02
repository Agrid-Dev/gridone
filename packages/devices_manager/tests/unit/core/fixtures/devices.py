from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from devices_manager.core.device import DeviceBase, PhysicalDevice

if TYPE_CHECKING:
    from devices_manager.core import Driver, TransportClient


@pytest.fixture
def device(driver: Driver, mock_transport_client: TransportClient) -> PhysicalDevice:
    return PhysicalDevice.from_base(
        DeviceBase(id="d1", name="My device", config={"some_id": "abc"}),
        driver=driver,
        transport=mock_transport_client,
    )


@pytest.fixture
def push_device(
    driver_w_push_transport: Driver,
    mock_push_transport_client: TransportClient,
) -> PhysicalDevice:
    return PhysicalDevice.from_base(
        DeviceBase(id="d2", name="My push device", config={"some_id": "xyz"}),
        driver=driver_w_push_transport,
        transport=mock_push_transport_client,
    )
