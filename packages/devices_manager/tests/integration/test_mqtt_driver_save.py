"""Saving a driver restarts every device that uses it, all at once (AGR-1695).

On MQTT, the Agrid thermostat's 257 attributes all listen on ``updData/<mac>``.
Subscribing once per listener sent devices x 257 SUBSCRIBEs in a burst: on a
site of 376 thermostats, the SUBACKs came back after aiomqtt's 10 s timeout and
374 devices never synced again. One SUBSCRIBE per topic is enough.
"""

from __future__ import annotations

import logging
from pathlib import Path
from unittest.mock import AsyncMock, patch

import aiomqtt
import pytest
import yaml
from fixtures.broker import publish_when_ready, wait_until

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


def _frame(mac: str) -> str:
    return (
        f'{{"mac":"{mac}","ip":"10.0.0.2","ts":1788786200,"data":[{{"name":'
        f'"Timestamp_UTC","type":"DATA_TYPE_INT32","acl":"r0w0m0","value":{SENTINEL}}}]}}'
    )


@pytest.mark.asyncio
@pytest.mark.integration
async def test_a_driver_save_subscribes_each_device_topic_at_most_once(
    broker, caplog: pytest.LogCaptureFixture
):
    _, port = broker
    caplog.set_level(logging.ERROR, logger="devices_manager.service")
    subscribes = 0
    subscribe = aiomqtt.Client.subscribe

    async def counted(self: aiomqtt.Client, *args: object, **kwargs: object) -> object:
        nonlocal subscribes
        subscribes += 1
        return await subscribe(self, *args, **kwargs)

    service = DevicesService()
    with (
        patch(
            "devices_manager.service.build_storage",
            AsyncMock(return_value=MemoryDevicesStorage()),
        ),
        patch.object(aiomqtt.Client, "subscribe", counted),
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
            await wait_until(lambda: not service._sync_tasks)  # noqa: SLF001
            assert subscribes == DEVICES

            before_save = subscribes
            await service.install_driver_package(
                DRIVER_ID, _package(2), "application/yaml"
            )
            await wait_until(lambda: not service._sync_tasks)  # noqa: SLF001
            saved_with = subscribes - before_save

            for mac in macs:
                await publish_when_ready(port, f"updData/{mac}", _frame(mac))
            await wait_until(
                lambda: all(
                    service.get_device(device_id)
                    .attributes["timestamp_utc"]
                    .current_value
                    == SENTINEL
                    for device_id in ids.values()
                )
            )
        finally:
            await service.stop()

    assert saved_with == DEVICES, f"{saved_with} SUBSCRIBEs for {DEVICES} devices"
    assert not [r for r in caplog.records if "Failed to start sync" in r.getMessage()]
