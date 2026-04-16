from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from fixtures.config import HTTP_PORT
from thermocktat_client import ThermocktatAsync

from devices_manager.core.device import DeviceBase, PhysicalDevice


@pytest_asyncio.fixture
async def thermocktat_http(
    thermocktat_container_mqtt,  # noqa: ARG001
) -> AsyncGenerator[ThermocktatAsync]:
    async with await ThermocktatAsync.connect(
        f"http://localhost:{HTTP_PORT}"
    ) as client:
        yield client


@pytest.fixture
def mqtt_device(mqtt_transport, thermocktat_mqtt_driver) -> PhysicalDevice:
    return PhysicalDevice.from_base(
        DeviceBase(
            id="thermocktat-1",
            name="Thermocktat 1",
            config={"device_id": "test-thermocktat"},
        ),
        transport=mqtt_transport,
        driver=thermocktat_mqtt_driver,
    )


@pytest.mark.asyncio
@pytest.mark.integration
async def test_read_attributes(thermocktat_container_mqtt, mqtt_device: PhysicalDevice):  # noqa: ARG001
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
    mqtt_device: PhysicalDevice,
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
    mqtt_device: PhysicalDevice,
    attribute: str,
    invalid_value,
):
    with pytest.raises(TypeError):
        await mqtt_device.write_attribute_value(attribute, invalid_value)


@pytest.mark.asyncio
@pytest.mark.integration
@pytest.mark.parametrize(
    ("setter", "attribute", "value", "expected"),
    [
        ("set_temperature_setpoint", "temperature_setpoint", 25.0, pytest.approx(25.0)),
        ("set_enabled", "state", False, False),
    ],
)
async def test_push_update_received(  # noqa: PLR0913
    thermocktat_container_mqtt,  # noqa: ARG001
    mqtt_device: PhysicalDevice,
    thermocktat_http: ThermocktatAsync,
    setter: str,
    attribute: str,
    value: object,
    expected: object,
):
    """External state change on thermocktat is received by MQTT device via push."""
    await mqtt_device.init_listeners()
    await getattr(thermocktat_http, setter)(value)
    # thermocktat publish_interval is 0.5s — allow margin for delivery
    await asyncio.sleep(1.0)
    assert mqtt_device.attributes[attribute].current_value == expected
