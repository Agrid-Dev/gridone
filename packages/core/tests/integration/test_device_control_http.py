import pytest
from core.device import Device, DeviceBase

from .fixtures.config import HTTP_PORT, TMK_DEVICE_ID


@pytest.fixture
def device(thermocktat_http_driver, http_transport) -> Device:
    base = DeviceBase(
        id=TMK_DEVICE_ID,
        name="My thermocktat",
        config={"ip": f"http://localhost:{HTTP_PORT}"},
    )

    return Device.from_base(
        base, transport=http_transport, driver=thermocktat_http_driver
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
