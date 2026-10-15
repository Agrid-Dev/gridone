"""Saving a driver restarts every device that uses it, all at once (AGR-1695).

On MQTT, the Agrid thermostat's 257 attributes all listen on ``updData/<mac>``.
Subscribing once per listener sent devices x 257 SUBSCRIBEs in a burst: on a
site of 376 thermostats, the SUBACKs came back after aiomqtt's 10 s timeout and
374 devices never synced again. One SUBSCRIBE per topic is enough.

A save replaces each device: the old one hands its listeners back, so its topic
is unsubscribed, and the new one subscribes it again (and gets retained state).
"""

from __future__ import annotations

import asyncio
import logging
import time
from pathlib import Path
from unittest.mock import AsyncMock, patch

import aiomqtt
import pytest
import yaml

from devices_manager import DevicesService
from devices_manager.core.transports.mqtt_transport import MqttTransportConfig
from devices_manager.dto import DeviceCreate
from devices_manager.dto.transport_dto import MqttTransportCreate
from devices_manager.storage.memory import MemoryDevicesStorage
from devices_manager.types import TransportProtocols

DRIVER = Path(__file__).parent / "fixtures/raw_drivers/agrid_thermostat_mqtts.yaml"
DRIVER_ID = "agrid_thermostat_mqtts"
DEVICES = 20
SENTINEL = 2_000_000_000


def _package(version: int) -> bytes:
    """The production driver as a bare manifest; a new version changes its
    runtime contract, so installing it restarts every device."""
    data = yaml.safe_load(DRIVER.read_text())
    data["version"] = version
    return yaml.safe_dump(data).encode()


def _frame(mac: str, value: int) -> str:
    return (
        f'{{"mac":"{mac}","ip":"10.0.0.2","ts":1788786200,"data":[{{"name":'
        f'"Timestamp_UTC","type":"DATA_TYPE_INT32","acl":"r0w0m0","value":{value}}}]}}'
    )


async def _publish_until_received(
    service: DevicesService, port: int, ids: dict[str, str], value: int
) -> None:
    """Publish each device's frame until its listeners have it.

    The frames are not retained, so one sent before a device subscribes is
    lost: a device that has the value is a device whose topic is subscribed.
    """
    deadline = time.monotonic() + 60
    async with aiomqtt.Client("127.0.0.1", port=port) as publisher:
        while missing := [
            mac
            for mac, device_id in ids.items()
            if service.get_device(device_id).attributes["timestamp_utc"].current_value
            != value
        ]:
            if time.monotonic() > deadline:
                msg = f"{len(missing)} devices never received {value}"
                raise TimeoutError(msg)
            for mac in missing:
                await publisher.publish(f"updData/{mac}", _frame(mac, value))
            await asyncio.sleep(0.2)


@pytest.mark.asyncio
@pytest.mark.integration
async def test_a_driver_save_subscribes_each_device_topic_at_most_once(
    broker, caplog: pytest.LogCaptureFixture
):
    _, port = broker
    caplog.set_level(logging.ERROR, logger="devices_manager.service")
    subscribes = 0
    unsubscribes = 0
    subscribe = aiomqtt.Client.subscribe
    unsubscribe = aiomqtt.Client.unsubscribe

    async def counted_subscribe(
        self: aiomqtt.Client, *args: object, **kwargs: object
    ) -> object:
        nonlocal subscribes
        subscribes += 1
        return await subscribe(self, *args, **kwargs)

    async def counted_unsubscribe(
        self: aiomqtt.Client, *args: object, **kwargs: object
    ) -> object:
        nonlocal unsubscribes
        unsubscribes += 1
        return await unsubscribe(self, *args, **kwargs)

    service = DevicesService()
    with (
        patch(
            "devices_manager.service.build_storage",
            AsyncMock(return_value=MemoryDevicesStorage()),
        ),
        patch.object(aiomqtt.Client, "subscribe", counted_subscribe),
        patch.object(aiomqtt.Client, "unsubscribe", counted_unsubscribe),
    ):
        await service.start()
        try:
            transport = await service.add_transport(
                MqttTransportCreate(
                    name="broker",
                    protocol=TransportProtocols.MQTT,
                    config=MqttTransportConfig(host="127.0.0.1", port=port),
                )
            )
            await service.install_driver_package(
                DRIVER_ID, _package(1), "application/yaml"
            )
            macs = {f"{i:012X}" for i in range(DEVICES)}
            ids = {
                mac: (
                    await service.add_device(
                        DeviceCreate(
                            name=f"thermostat {mac}",
                            config={"mac": mac},
                            driver_id=DRIVER_ID,
                            transport_id=transport.id,
                        )
                    )
                ).id
                for mac in macs
            }
            await _publish_until_received(service, port, ids, SENTINEL)
            assert (subscribes, unsubscribes) == (DEVICES, 0)

            await service.install_driver_package(
                DRIVER_ID, _package(2), "application/yaml"
            )
            # The new devices start from the old ones' values: wait for a new one.
            await _publish_until_received(service, port, ids, SENTINEL + 1)
            saved_with = (subscribes - DEVICES, unsubscribes)
        finally:
            await service.stop()

    assert saved_with == (DEVICES, DEVICES), (
        f"(SUBSCRIBEs, UNSUBSCRIBEs) {saved_with} for {DEVICES} devices"
    )
    assert not [r for r in caplog.records if "Failed to start sync" in r.getMessage()]
