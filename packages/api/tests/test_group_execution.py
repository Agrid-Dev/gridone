"""Composition tests for dynamic group targets and independent unit outcomes."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest

from api.action_providers.commands import CommandsActionProvider
from api.targets import CompositeTargetResolver
from commands import CommandsService
from commands.models import AttributeWrite, CommandTemplateCreate, WriteResult
from devices_manager import DevicesServiceInterface
from devices_manager.core.device import Attribute
from devices_manager.core.device_group import DeviceGroup
from devices_manager.dto import Device
from models.action_failure import ActionExecutionError
from models.pagination import PaginationParams
from models.targets import DevicesFilter
from models.types import DataType


@pytest.mark.asyncio
async def test_automation_resolves_current_members_once():
    now = datetime.now(UTC)
    group = DeviceGroup(
        id="group",
        name="East",
        driver_id="driver",
        device_ids=["a"],
        created_at=now,
        updated_at=now,
    )
    devices = {
        id_: Device(
            id=id_,
            name=id_,
            driver_id="driver",
            transport_id="t",
            config={},
            attributes={
                "setpoint": Attribute.create(
                    "setpoint", DataType.FLOAT, {"read", "write"}, value=20
                )
            },
        )
        for id_ in ("a", "b")
    }
    dm = MagicMock(spec=DevicesServiceInterface)
    dm.get_group.side_effect = lambda _: group.model_copy(deep=True)
    dm.list_devices.side_effect = lambda **kwargs: [
        devices[id_] for id_ in kwargs["ids"]
    ]
    writer = AsyncMock(return_value=WriteResult(last_changed=now))
    commands = CommandsService(None, writer, AsyncMock(), CompositeTargetResolver(dm))
    await commands.start()
    try:
        template = await commands.save_template(
            CommandTemplateCreate(
                name="Comfort",
                target=DevicesFilter(group_id="group"),
                write=AttributeWrite(
                    attribute="setpoint", value=24, data_type=DataType.FLOAT
                ),
            ),
            "operator",
        )
        provider = CommandsActionProvider(commands, dm)
        first = await provider.execute({"template_id": template.id})
        group.device_ids = ["a", "b"]
        second = await provider.execute({"template_id": template.id})
        group.device_ids = ["b"]
        third = await provider.execute({"template_id": template.id})
        await commands.stop()
        for batch, expected in [(first, ["a"]), (second, ["a", "b"]), (third, ["b"])]:
            rows = await commands.get_commands(
                pagination=PaginationParams(), batch_id=batch
            )
            assert sorted(row.device_id for row in rows.items) == expected
        assert (await commands.get_template(template.id)).target == DevicesFilter(
            group_id="group"
        )
    finally:
        await commands.stop()


@pytest.mark.asyncio
async def test_missing_group_fails_before_dispatch():
    from commands.interface import CommandsServiceInterface
    from commands.models import CommandTemplate
    from models.errors import NotFoundError

    dm = MagicMock(spec=DevicesServiceInterface)
    dm.get_group.side_effect = NotFoundError("missing")
    commands = AsyncMock(spec=CommandsServiceInterface)
    commands.get_template.return_value = CommandTemplate(
        id="template",
        name="Comfort",
        target=DevicesFilter(group_id="missing"),
        write=AttributeWrite(attribute="setpoint", value=24, data_type=DataType.FLOAT),
        created_at=datetime.now(UTC),
        created_by="operator",
    )
    with pytest.raises(ActionExecutionError) as error:
        await CommandsActionProvider(commands, dm).execute({"template_id": "template"})
    assert error.value.details.code == "invalid_device_group"
    commands.dispatch_from_template.assert_not_awaited()
