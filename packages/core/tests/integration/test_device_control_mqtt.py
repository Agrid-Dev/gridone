from pathlib import Path

import pytest
import yaml
from core.device import Device
from core.devices_manager import DevicesManager
from core.types import TransportProtocols

fixture_path = Path(__file__).parent / "fixtures" / "thermockat_mqtt_driver.yaml"
with fixture_path.open("r") as file:
    thermocktat_mqtt_driver = yaml.safe_load(file)


@pytest.fixture
def mqtt_device() -> Device:
    return DevicesManager.build_device(
        {
            "id": "test-thermocktat",
            "driver": "thermocktat_mqtt",
            "transport_id": "t1",
            "config": {"device_id": "test-thermocktat"},
        },
        thermocktat_mqtt_driver,
        transport={
            "id": "t1",
            "protocol": TransportProtocols.MQTT,
            "config": {"host": "127.0.0.1"},
        },
    )


@pytest.mark.asyncio
@pytest.mark.integration
async def test_read_attributes(thermocktat_container_mqtt, mqtt_device: Device):  # noqa: ARG001
    await mqtt_device.update_attributes()
    assert not mqtt_device.attributes["state"].current_value
    assert mqtt_device.attributes["temperature_setpoint"].current_value == 22
    assert mqtt_device.attributes["fan_speed"].current_value == "auto"


@pytest.mark.asyncio
@pytest.mark.integration
@pytest.mark.parametrize(
    ("attribute", "value"),
    [("temperature_setpoint", 20), ("state", True), ("fan_speed", "low")],
)
async def test_write_attribute(
    thermocktat_container_mqtt,  # noqa: ARG001
    mqtt_device: Device,
    attribute: str,
    value,
):
    await mqtt_device.write_attribute_value(attribute, value)
    assert mqtt_device.attributes[attribute].current_value == value


@pytest.mark.asyncio
@pytest.mark.integration
@pytest.mark.parametrize(
    ("attribute", "invalid_value"),
    [("temperature_setpoint", bool), ("state", 88)],
)
async def test_write_attribute_invalid_value(
    thermocktat_container_mqtt,  # noqa: ARG001
    mqtt_device: Device,
    attribute: str,
    invalid_value,
):
    with pytest.raises(TypeError):
        await mqtt_device.write_attribute_value(attribute, invalid_value)
