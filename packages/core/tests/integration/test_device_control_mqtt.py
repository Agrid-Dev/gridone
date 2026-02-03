import pytest
from core.device import Device, DeviceBase


@pytest.fixture
def mqtt_device(mqtt_transport, thermocktat_mqtt_driver) -> Device:
    base = DeviceBase(
        id="thermocktat-1",
        name="Thermocktat 1",
        config={"device_id": "test-thermocktat"},
    )
    return Device.from_base(
        base, transport=mqtt_transport, driver=thermocktat_mqtt_driver
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
