import asyncio

import pytest
from devices_manager import DevicesManager

from .fixtures.config import TMK_DEVICE_ID


@pytest.fixture
def devices_manager(thermocktat_mqtt_driver, mqtt_transport) -> DevicesManager:
    return DevicesManager(
        devices={},
        drivers={thermocktat_mqtt_driver.id: thermocktat_mqtt_driver},
        transports={mqtt_transport.id: mqtt_transport},
    )


@pytest.mark.asyncio
@pytest.mark.integration
async def test_discover_devices(
    devices_manager: DevicesManager,
    thermocktat_container_mqtt,  # noqa: ARG001
):
    assert len(devices_manager.list_devices()) == 0

    driver_id = devices_manager.list_drivers()[0].id
    transport_id = devices_manager.list_transports()[0].id
    await devices_manager.discovery_manager.register(
        driver_id=driver_id, transport_id=transport_id
    )
    await asyncio.sleep(1)
    for d in devices_manager.list_devices():
        print(d.id, d.config)
    assert len(devices_manager.list_devices()) == 1
    device = devices_manager.list_devices()[0]
    assert device.config["device_id"] == TMK_DEVICE_ID
