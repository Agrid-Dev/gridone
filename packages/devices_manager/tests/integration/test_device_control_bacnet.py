"""Integration tests for the BACnet transport client.

A thermocktat container with the BACnet/IP controller enabled plays the
device-under-test. The client binds the device via a directed (unicast) Who-Is
to its published UDP port, then reads/writes against the bound address — the
container-friendly discovery path AGR-637 targets (no LAN broadcast).

Note: thermocktat transports every present-value as Real (float32) and only
decodes Real on write, so this suite covers analog reads, a bool read, and a
float write. Multi-state attributes and non-float writes are exercised against
real devices, not this emulator.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
import pytest_asyncio

from devices_manager.core.device import CoreDevice, DeviceBase
from devices_manager.core.transports import (
    TransportMetadata,
    make_transport_client,
    make_transport_config,
)
from devices_manager.types import TransportProtocols

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator

    from devices_manager.core.driver import Driver


@pytest_asyncio.fixture
async def bacnet_device(
    thermocktat_container_bacnet: tuple[str, int],
    thermocktat_bacnet_driver: Driver,
) -> AsyncGenerator[CoreDevice]:
    host, port = thermocktat_container_bacnet
    transport = make_transport_client(
        TransportProtocols.BACNET,
        make_transport_config(
            TransportProtocols.BACNET,
            # /32 → no broadcast socket (CI-safe); directed Who-Is to the
            # container's published port binds it without a LAN broadcast.
            {"ip_with_mask": f"{host}/32", "discovery_address": host, "port": port},
        ),
        TransportMetadata(id="bacnet-transport", name="bacnet-transport"),
    )
    device = CoreDevice.from_base(
        DeviceBase(
            id="bacnet-thermocktat",
            name="BACnet Thermocktat",
            config={"device_instance": 1},
        ),
        transport=transport,
        driver=thermocktat_bacnet_driver,
    )
    await transport.connect()
    try:
        yield device
    finally:
        await transport.close()


@pytest.mark.asyncio
@pytest.mark.integration
async def test_read_attributes(bacnet_device: CoreDevice) -> None:
    """Reads cover float (AV/AI), bool (BV) and int (fault) data types."""
    await bacnet_device.update_attributes()
    attrs = bacnet_device.attributes
    # Ambient may drift from the regulator/heat-loss model; just sanity-check it.
    temperature = attrs["temperature"].current_value
    assert isinstance(temperature, float)
    assert 5.0 < temperature < 40.0
    assert attrs["temperature_setpoint"].current_value == pytest.approx(22.0)
    assert attrs["temperature_setpoint_min"].current_value == pytest.approx(16.0)
    assert attrs["temperature_setpoint_max"].current_value == pytest.approx(28.0)
    assert attrs["onoff_state"].current_value is False
    assert attrs["fault_code"].current_value == 0
    # Values must be plain Python types, not bacpypes wrappers (timeseries does
    # an exact type() lookup on them).
    assert type(attrs["temperature_setpoint"].current_value) is float
    assert type(attrs["onoff_state"].current_value) is bool
    assert type(attrs["fault_code"].current_value) is int


@pytest.mark.asyncio
@pytest.mark.integration
@pytest.mark.parametrize(
    ("attribute", "value"),
    [
        ("temperature_setpoint", 25.0),
        ("temperature_setpoint_min", 15.0),
        ("temperature_setpoint_max", 30.0),
    ],
)
async def test_write_attribute(
    bacnet_device: CoreDevice, attribute: str, value: float
) -> None:
    # thermocktat only decodes Real on write, so this covers float (AnalogValue)
    # writes. bool/int writes use BinaryPV/Integer and are exercised on real
    # devices, not this emulator.
    await bacnet_device.write_attribute_value(attribute, value)
    assert bacnet_device.attributes[attribute].current_value == value
    # Re-read from the device to confirm the write landed over unicast.
    await bacnet_device.update_attributes()
    assert bacnet_device.attributes[attribute].current_value == pytest.approx(value)
