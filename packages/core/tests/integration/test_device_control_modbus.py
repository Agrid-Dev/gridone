from pathlib import Path

import pytest
import yaml
from core import Driver
from core.device import Device, DeviceBase
from core.transports import (
    TransportMetadata,
    make_transport_client,
    make_transport_config,
)
from core.types import TransportProtocols
from dto.driver_dto import DriverDTO, dto_to_core

from .conftest import DEVICE_ID


@pytest.fixture
def thermocktat_modbus_driver() -> Driver:
    fixture_path = Path(__file__).parent / "fixtures" / "thermocktat_modbus_driver.yaml"
    with fixture_path.open("r") as file:
        driver_data = yaml.safe_load(file)
    dto = DriverDTO.model_validate(driver_data)
    return dto_to_core(dto)


@pytest.fixture
def device(thermocktat_container_modbus, thermocktat_modbus_driver) -> Device:
    host, port = thermocktat_container_modbus
    base = DeviceBase(
        id=DEVICE_ID,
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
    return Device.from_base(
        base, transport=modbus_transport, driver=thermocktat_modbus_driver
    )


@pytest.mark.asyncio
@pytest.mark.integration
async def test_read_attributes(thermocktat_container_modbus, device: Device):  # noqa: ARG001
    await device.update_attributes()
    assert not device.attributes["state"].current_value
    assert device.attributes["temperature_setpoint"].current_value == 22
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
    with pytest.raises(TypeError):
        await device.write_attribute_value(attribute, invalid_value)
