"""A measurement recovered after an invalid sample never runs an automation.

Wires a real device, the change-event trigger provider and the automations
service: valid → invalid → valid must log two baselines and send nothing.
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, MagicMock

import pytest
from automations.models import (
    Action,
    AutomationBranch,
    AutomationCreate,
    ExecutionStatus,
    Trigger,
)
from automations.service import AutomationsService
from pydantic import BaseModel

from api.trigger_providers.change_event import ChangeEventTriggerProvider
from devices_manager import CoreDevice, DeviceBase, Driver
from devices_manager.core.codecs.factory import CodecSpec
from devices_manager.core.driver import AttributeDriver, DriverMetadata, UpdateStrategy
from devices_manager.core.transports import TransportMetadata
from devices_manager.core.transports.http_transport import (
    HTTPTransportClient,
    HttpTransportConfig,
)
from devices_manager.types import DataType, TransportProtocols

if TYPE_CHECKING:
    from collections.abc import Awaitable

SENTINEL = -2147483648


class _NoParams(BaseModel):
    pass


def _thermostat() -> CoreDevice:
    temperature = AttributeDriver(
        name="temperature",
        data_type=DataType.FLOAT,
        read="GET /temperature",
        write=None,
        codecs=[
            CodecSpec(name="invalid_values", argument=[SENTINEL]),
            CodecSpec(name="scale", argument=0.001),
        ],
    )
    driver = Driver(
        metadata=DriverMetadata(id="thermostat"),
        env={},
        transport=TransportProtocols.HTTP,
        device_config_required=[],
        update_strategy=UpdateStrategy(polling_enabled=False),
        attributes={"temperature": temperature},
    )
    return CoreDevice.from_base(
        DeviceBase(id="thermostat", name="Thermostat", config={}),
        driver=driver,
        transport=HTTPTransportClient(
            TransportMetadata(id="http", name="HTTP"), HttpTransportConfig()
        ),
    )


@pytest.mark.asyncio
async def test_valid_invalid_valid_logs_baselines_and_sends_nothing(monkeypatch):
    device = _thermostat()
    pending: list[Awaitable[None]] = []

    def subscribe(callback) -> str:
        # The devices service schedules each listener; the test awaits them.
        device.on_update = lambda *args, **kwargs: pending.append(
            callback(*args, **kwargs)
        )
        return "listener"

    devices = MagicMock()
    devices.add_device_attribute_listener.side_effect = subscribe
    action = MagicMock()
    action.id = "command_template"
    action.params_model = _NoParams
    action.execute = AsyncMock(return_value="output")
    action.describe_writes = AsyncMock(return_value=[])
    service = AutomationsService(
        storage_url=None,
        trigger_providers=[ChangeEventTriggerProvider(devices)],
        action_providers=[action],
    )
    await service.start()
    try:
        automation = await service.create(
            AutomationCreate(
                name="On any change",
                trigger=Trigger(
                    provider_id="change_event",
                    params={"device_id": "thermostat", "attribute": "temperature"},
                ),
                branches=[AutomationBranch(action=Action(provider_id=action.id))],
            ),
            created_by="u1",
        )
        monkeypatch.setattr(
            device.transport,
            "_read",
            AsyncMock(side_effect=[20000, SENTINEL, 20000]),
        )
        for _ in range(3):
            await device.read_attribute_value("temperature")
            while pending:
                await pending.pop(0)

        action.execute.assert_not_awaited()
        executions = await service.list_executions(automation.id)
        assert [(e.status, e.reason) for e in executions] == [
            (ExecutionStatus.INITIALIZED, "first_observation"),
            (ExecutionStatus.INITIALIZED, "first_observation"),
        ]
    finally:
        await service.stop()
