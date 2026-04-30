import asyncio

import pytest
from fixtures.config import TMK_DEVICE_ID

from devices_manager import DevicesService


@pytest.fixture
def devices_service(thermocktat_mqtt_driver, mqtt_transport) -> DevicesService:
    return DevicesService(
        drivers={thermocktat_mqtt_driver.id: thermocktat_mqtt_driver},
        transports={mqtt_transport.id: mqtt_transport},
    )


@pytest.mark.asyncio
@pytest.mark.integration
async def test_discover_devices(
    devices_service: DevicesService,
    thermocktat_container_mqtt,  # noqa: ARG001
):
    assert len(devices_service.list_devices()) == 0

    driver_id = devices_service.list_drivers()[0].id
    transport_id = devices_service.list_transports()[0].id
    await devices_service.discovery_manager.register(
        driver_id=driver_id, transport_id=transport_id
    )
    await asyncio.sleep(1)
    for d in devices_service.list_devices():
        print(d.id, d.config)
    assert len(devices_service.list_devices()) == 1
    device = devices_service.list_devices()[0]
    assert device.config is not None
    assert device.config["device_id"] == TMK_DEVICE_ID
