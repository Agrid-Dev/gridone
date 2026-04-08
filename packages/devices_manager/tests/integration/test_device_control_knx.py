from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio

from devices_manager.core.device import DeviceBase, PhysicalDevice
from devices_manager.core.transports import PushTransportClient
from devices_manager.core.utils.templating.render import render_struct


async def _wait_for_knx_tunnel(device: PhysicalDevice) -> None:
    """Retry connect until the KNX/IP tunnel is ready (container startup lag)."""
    last_error: Exception | None = None
    for _ in range(30):
        try:
            await device.transport.connect()
        except Exception as e:  # noqa: BLE001
            last_error = e
            await asyncio.sleep(0.2)
        else:
            return
    msg = "KNX tunnel connection could not be established"
    raise RuntimeError(msg) from last_error


async def _register_listener(
    device: PhysicalDevice, attr_name: str, received: list[object]
) -> None:
    """Register a listener on the GA of ``attr_name`` and append to ``received``."""
    transport = device.transport
    assert isinstance(transport, PushTransportClient)
    context = {**device.driver.env, **device.config}
    address = transport.build_address(
        render_struct(device.driver.attributes[attr_name].read, context), context
    )
    await transport.register_listener(address.topic, received.append)


@pytest_asyncio.fixture
async def connected_knx_device(
    thermocktat_container_knx,  # noqa: ARG001
    knx_device: PhysicalDevice,
) -> AsyncGenerator[PhysicalDevice]:
    await _wait_for_knx_tunnel(knx_device)
    try:
        yield knx_device
    finally:
        await knx_device.transport.close()


@pytest.fixture
def knx_device(knx_transport, thermocktat_knx_driver) -> PhysicalDevice:
    return PhysicalDevice.from_base(
        DeviceBase(
            id="thermocktat-1",
            name="Thermocktat 1",
            config={"ga_main": "1", "ga_middle": "0"},
        ),
        transport=knx_transport,
        driver=thermocktat_knx_driver,
    )


@pytest.mark.asyncio
@pytest.mark.integration
async def test_read_attributes(connected_knx_device: PhysicalDevice):
    await connected_knx_device.update_attributes()
    attrs = connected_knx_device.attributes
    assert not attrs["onoff_state"].current_value
    assert attrs["temperature_setpoint"].current_value == pytest.approx(22.0)
    assert attrs["temperature"].current_value == pytest.approx(21.0)
    assert attrs["fan_speed"].current_value == "auto"


@pytest.mark.asyncio
@pytest.mark.integration
@pytest.mark.parametrize(
    ("attribute", "value"),
    [("temperature_setpoint", 20), ("onoff_state", True), ("fan_speed", "low")],
)
async def test_write_attribute(
    connected_knx_device: PhysicalDevice,
    attribute: str,
    value,
):
    await connected_knx_device.write_attribute_value(attribute, value)
    assert connected_knx_device.attributes[attribute].current_value == value


@pytest.mark.asyncio
@pytest.mark.integration
async def test_listen_receives_update(connected_knx_device: PhysicalDevice):
    received: list[object] = []
    await _register_listener(connected_knx_device, "onoff_state", received)
    await connected_knx_device.write_attribute_value("onoff_state", value=True)
    assert received != []


@pytest.mark.asyncio
@pytest.mark.integration
async def test_listen_receives_temperature(connected_knx_device: PhysicalDevice):
    """Listener on temperature GA receives GroupValueResponse triggered by a read."""
    transport = connected_knx_device.transport
    assert isinstance(transport, PushTransportClient)
    context = {**connected_knx_device.driver.env, **connected_knx_device.config}
    attr_read = connected_knx_device.driver.attributes["temperature"].read
    address = transport.build_address(render_struct(attr_read, context), context)
    received: list[object] = []
    await transport.register_listener(address.topic, received.append)
    # GroupValueRead → GroupValueResponse → listener fires
    await transport.read(address)
    assert received != []
