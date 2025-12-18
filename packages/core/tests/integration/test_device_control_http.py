from pathlib import Path

import pytest
import yaml
from core.device import Device
from core.devices_manager import DevicesManager

from .conftest import DEVICE_ID, HTTP_PORT

fixture_path = Path(__file__).parent / "fixtures" / "thermockat_http_driver.yaml"
with fixture_path.open("r") as file:
    thermocktat_http_driver = yaml.safe_load(file)


@pytest.fixture
def device() -> Device:
    return DevicesManager.build_device(
        {
            "id": DEVICE_ID,
            "driver": "thermocktat_http",
            "transport_config": "",
            "config": {"ip": f"http://localhost:{HTTP_PORT}"},
        },
        thermocktat_http_driver,
        transport_config=None,
    )


@pytest.mark.asyncio
@pytest.mark.integration
async def test_read_attributes(thermocktat_container_http, device: Device):  # noqa: ARG001
    await device.update_attributes()
    assert not device.attributes["state"].current_value
    assert device.attributes["temperature_setpoint"].current_value == 22
    assert device.attributes["fan_speed"].current_value == "auto"


@pytest.mark.asyncio
@pytest.mark.integration
@pytest.mark.parametrize(
    ("attribute", "value"),
    [("temperature_setpoint", 20), ("state", True), ("fan_speed", "low")],
)
async def test_write_attribute(
    thermocktat_container_http,  # noqa: ARG001
    device: Device,
    attribute: str,
    value,
):
    await device.write_attribute_value(attribute, value)
    assert device.attributes[attribute].current_value == value


@pytest.mark.asyncio
@pytest.mark.integration
@pytest.mark.parametrize(
    ("attribute", "invalid_value"),
    [("temperature_setpoint", bool), ("state", 88)],
)
async def test_write_attribute_invalid_value(
    thermocktat_container_http,  # noqa: ARG001
    device: Device,
    attribute: str,
    invalid_value,
):
    with pytest.raises(TypeError):
        await device.write_attribute_value(attribute, invalid_value)
