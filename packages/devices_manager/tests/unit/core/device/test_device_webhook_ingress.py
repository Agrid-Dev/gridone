"""End-to-end webhook pipeline at the device level: an HTTP push entering
through the `MessageIngress` port flows listener -> codecs -> attributes,
and device health follows the silence watchdog like any push transport.

The `webhook_driver` / `webhook_transport_client` fixtures come from
tests/unit/core/fixtures (shared via conftest).
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

import pytest

from devices_manager.core.device import Attribute, CoreDevice, DeviceBase
from devices_manager.core.device.connection_status import (
    CONNECTION_STATUS_ATTR,
    SILENCE_DEGRADED_MULTIPLIER,
    SILENCE_ERROR_MULTIPLIER,
)
from devices_manager.ingress import IngressRequest
from devices_manager.types import ConnectionStatus
from models.errors import InvalidError

if TYPE_CHECKING:
    from devices_manager.core.driver import Driver
    from devices_manager.core.transports.webhook_transport import (
        WebhookTransportClient,
    )

TICK = 0.05


def _make_device(
    driver: Driver,
    transport: WebhookTransportClient,
    on_update=None,
) -> CoreDevice:
    return CoreDevice.from_base(
        DeviceBase(id="room1-dev", name="Room 1", config={"room_id": "room1"}),
        driver=driver,
        transport=transport,
        on_update=on_update,
    )


def _snapshot(temperature: float, humidity: float) -> IngressRequest:
    payload = f'{{"temperature": {temperature}, "humidity": {humidity}}}'
    return IngressRequest(topic="room1/snapshot", payload=payload.encode())


@pytest.mark.asyncio
class TestWebhookIngressPipeline:
    async def test_push_decodes_snapshot_into_attributes(
        self, webhook_driver, webhook_transport_client
    ) -> None:
        device = _make_device(webhook_driver, webhook_transport_client)
        await device.init_listeners()

        result = await webhook_transport_client.ingress(_snapshot(21.5, 55.0))

        assert result.matched == 2
        assert device.attributes["temperature"].current_value == 21.5
        assert device.attributes["humidity"].current_value == 55.0

    async def test_topic_is_rendered_from_device_config(
        self, webhook_driver, webhook_transport_client
    ) -> None:
        device = _make_device(webhook_driver, webhook_transport_client)
        await device.init_listeners()

        other_room = IngressRequest(
            topic="room2/snapshot", payload=b'{"temperature": 1, "humidity": 2}'
        )
        result = await webhook_transport_client.ingress(other_room)

        assert result.matched == 0
        assert device.attributes["temperature"].current_value is None

    async def test_on_update_fires_on_change_only(
        self, webhook_driver, webhook_transport_client
    ) -> None:
        updates: list[str] = []

        def on_update(
            _device: CoreDevice,
            attribute_name: str,
            _previous: Attribute | None,
            _attribute: Attribute,
        ) -> None:
            # The internal connection_status attribute also updates on the
            # first successful listen; only driver attributes matter here.
            if attribute_name != CONNECTION_STATUS_ATTR:
                updates.append(attribute_name)

        device = _make_device(
            webhook_driver, webhook_transport_client, on_update=on_update
        )
        await device.init_listeners()

        await webhook_transport_client.ingress(_snapshot(21.5, 55.0))
        assert sorted(updates) == ["humidity", "temperature"]

        # Same values again: no change, no update events.
        await webhook_transport_client.ingress(_snapshot(21.5, 55.0))
        assert len(updates) == 2

        # One value changes: exactly one more event.
        await webhook_transport_client.ingress(_snapshot(22.0, 55.0))
        assert sorted(updates) == ["humidity", "temperature", "temperature"]

    async def test_on_demand_read_is_rejected(
        self, webhook_driver, webhook_transport_client
    ) -> None:
        # Push-only: a read cannot solicit data, and serving it from a cache
        # would log a READ-ok entry masking watchdog-detected silence.
        device = _make_device(webhook_driver, webhook_transport_client)
        await device.init_listeners()
        await webhook_transport_client.ingress(_snapshot(21.5, 55.0))

        with pytest.raises(InvalidError, match="ingress-only"):
            await device.read_attribute_value("temperature")
        # The pushed value is untouched by the failed read.
        assert device.attributes["temperature"].current_value == 21.5


def _silence(device: CoreDevice, multiplier: float) -> None:
    interval = device.expected_interval
    assert interval is not None
    assert device._watchdog is not None  # noqa: SLF001
    device._watchdog._last_data_time = datetime.now(UTC) - timedelta(  # noqa: SLF001
        seconds=multiplier * interval
    )


@pytest.mark.asyncio
class TestWebhookSilenceWatchdog:
    """A webhook has no connection to monitor: device health comes from the
    silence watchdog fed by `healthcheck.expected_push_interval`."""

    async def test_degraded_after_double_interval_silence(
        self, webhook_driver, webhook_transport_client
    ) -> None:
        device = _make_device(webhook_driver, webhook_transport_client)
        await device.start_sync()
        _silence(device, SILENCE_DEGRADED_MULTIPLIER + 0.5)
        await asyncio.sleep(TICK)
        assert (
            device.get_attribute_value(CONNECTION_STATUS_ATTR)
            == ConnectionStatus.DEGRADED
        )
        await device.stop_sync()

    async def test_error_after_triple_interval_silence(
        self, webhook_driver, webhook_transport_client
    ) -> None:
        device = _make_device(webhook_driver, webhook_transport_client)
        await device.start_sync()
        _silence(device, SILENCE_ERROR_MULTIPLIER + 0.5)
        await asyncio.sleep(TICK)
        assert (
            device.get_attribute_value(CONNECTION_STATUS_ATTR) == ConnectionStatus.ERROR
        )
        await device.stop_sync()

    async def test_push_keeps_device_healthy(
        self, webhook_driver, webhook_transport_client
    ) -> None:
        device = _make_device(webhook_driver, webhook_transport_client)
        await device.start_sync()
        await webhook_transport_client.ingress(_snapshot(21.5, 55.0))
        await asyncio.sleep(TICK)
        assert device.get_attribute_value(CONNECTION_STATUS_ATTR) not in (
            ConnectionStatus.DEGRADED,
            ConnectionStatus.ERROR,
        )
        await device.stop_sync()
