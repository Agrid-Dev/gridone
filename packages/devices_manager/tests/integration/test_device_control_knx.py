from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator

import httpx
import pytest
import pytest_asyncio

from devices_manager.core.device import DeviceBase, PhysicalDevice

from .fixtures.config import HTTP_PORT


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


@pytest_asyncio.fixture
async def connected_knx_device(
    thermocktat_container_knx_http,  # noqa: ARG001
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
@pytest.mark.parametrize(
    ("http_endpoint", "attribute", "http_value", "expected"),
    [
        ("/v1/temperature_setpoint", "temperature_setpoint", 25.0, pytest.approx(25.0)),
        ("/v1/enabled", "onoff_state", True, True),
    ],
)
async def test_push_update_received(
    connected_knx_device: PhysicalDevice,
    http_endpoint: str,
    attribute: str,
    http_value: object,
    expected: object,
):
    """External state change on thermocktat is received by KNX device via push."""
    await connected_knx_device.init_listeners()
    async with httpx.AsyncClient() as http_client:
        resp = await http_client.post(
            f"http://localhost:{HTTP_PORT}{http_endpoint}",
            json={"value": http_value},
        )
        assert resp.status_code == 200
    # thermocktat publish_interval is 0.5s — allow margin for delivery
    await asyncio.sleep(1.0)
    assert connected_knx_device.attributes[attribute].current_value == expected
