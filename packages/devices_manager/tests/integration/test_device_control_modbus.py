import pytest
from devices_manager.core.device import Device, DeviceBase
from devices_manager.core.transports import (
    TransportMetadata,
    make_transport_client,
    make_transport_config,
)
from devices_manager.types import TransportProtocols

from .fixtures.config import TMK_DEVICE_ID


@pytest.fixture(params=["single", "multi"])
def modbus_driver(
    request,
    thermocktat_modbus_driver_multi,
    thermocktat_modbus_driver_single,
):
    if request.param == "single":
        return thermocktat_modbus_driver_single
    return thermocktat_modbus_driver_multi


@pytest.fixture
def device(thermocktat_container_modbus, modbus_driver) -> Device:
    host, port = thermocktat_container_modbus
    base = DeviceBase(
        id=TMK_DEVICE_ID,
        name="My thermocktat",
        config={"device_id": 4},
    )
    modbus_transport = make_transport_client(
        TransportProtocols.MODBUS_TCP,
        make_transport_config(
            TransportProtocols.MODBUS_TCP, {"host": host, "port": port}
        ),
        TransportMetadata(id="my-transport", name="my-transport"),
    )
    return Device.from_base(base, transport=modbus_transport, driver=modbus_driver)


@pytest.mark.asyncio
@pytest.mark.integration
async def test_read_attributes(thermocktat_container_modbus, device: Device):  # noqa: ARG001
    await device.update_attributes()
    assert "state" in device.attributes
    assert not device.attributes["state"].current_value
    if "temperature_setpoint" in device.attributes:
        assert device.attributes["temperature_setpoint"].current_value == 22
    if "fan_speed" in device.attributes:
        assert device.attributes["fan_speed"].current_value == 1


@pytest.mark.asyncio
@pytest.mark.integration
@pytest.mark.parametrize(
    ("attribute", "value"),
    [("temperature_setpoint", 20), ("state", True), ("fan_speed", 1)],
)
async def test_write_attribute(
    thermocktat_container_modbus,  # noqa: ARG001
    device: Device,
    attribute: str,
    value,
):
    if attribute not in device.attributes:
        pytest.skip("Attribute not supported by this driver variant")
    await device.write_attribute_value(attribute, value)
    assert device.attributes[attribute].current_value == value


@pytest.mark.asyncio
@pytest.mark.integration
@pytest.mark.parametrize(
    ("attribute", "invalid_value"),
    [("temperature_setpoint", bool), ("state", 88), ("fan_speed", "low")],
)
async def test_write_attribute_invalid_value(
    thermocktat_container_modbus,  # noqa: ARG001
    device: Device,
    attribute: str,
    invalid_value,
):
    if attribute not in device.attributes:
        pytest.skip("Attribute not supported by this driver variant")
    with pytest.raises(TypeError):
        await device.write_attribute_value(attribute, invalid_value)
