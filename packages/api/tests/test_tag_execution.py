"""Composition tests for dynamic group targets and independent unit outcomes."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from automations.diagnostics import describe_writes, diagnose
from automations.models import Action, Automation, AutomationBranch, Trigger

from api.action_providers.commands import CommandsActionProvider
from api.targets import CompositeTargetResolver
from commands import CommandsService
from commands.models import AttributeWrite, CommandTemplateCreate, WriteResult
from devices_manager import DevicesServiceInterface
from devices_manager.core.device import Attribute
from devices_manager.dto import Device
from models.pagination import PaginationParams
from models.targets import DevicesFilter
from models.types import DataType


@pytest.mark.asyncio
async def test_automation_resolves_current_members_once():
    now = datetime.now(UTC)
    devices = {
        id_: Device(
            id=id_,
            name=id_,
            driver_id="driver",
            transport_id="t",
            config={},
            tags={"loop": ["east"]} if id_ == "a" else {},
            attributes={
                "setpoint": Attribute.create(
                    "setpoint", DataType.FLOAT, {"read", "write"}, value=20
                )
            },
        )
        for id_ in ("a", "b")
    }
    dm = MagicMock(spec=DevicesServiceInterface)
    dm.list_devices.side_effect = lambda **kwargs: [
        d
        for d in devices.values()
        if d.tags.get("loop") == ["east"] and d.driver_id == kwargs["driver_id"]
    ]
    writer = AsyncMock(return_value=WriteResult(last_changed=now))
    commands = CommandsService(None, writer, AsyncMock(), CompositeTargetResolver(dm))
    await commands.start()
    try:
        template = await commands.save_template(
            CommandTemplateCreate(
                name="Comfort",
                target=DevicesFilter(tags={"loop": ["east"]}, driver_id="driver"),
                write=AttributeWrite(
                    attribute="setpoint", value=24, data_type=DataType.FLOAT
                ),
            ),
            "operator",
        )
        provider = CommandsActionProvider(commands, MagicMock())
        first = await provider.execute({"template_id": template.id})
        devices["b"].tags = {"loop": ["east"]}
        second = await provider.execute({"template_id": template.id})
        devices["a"].tags = {}
        third = await provider.execute({"template_id": template.id})
        await commands.stop()
        for batch, expected in [(first, ["a"]), (second, ["a", "b"]), (third, ["b"])]:
            rows = await commands.get_commands(
                pagination=PaginationParams(), batch_id=batch
            )
            assert sorted(row.device_id for row in rows.items) == expected
        assert (await commands.get_template(template.id)).target == DevicesFilter(
            tags={"loop": ["east"]}, driver_id="driver"
        )
    finally:
        await commands.stop()


@pytest.mark.asyncio
async def test_diagnosis_follows_the_members_a_dispatch_would_write():
    devices = {
        id_: Device(
            id=id_,
            name=id_,
            driver_id="driver",
            transport_id="t",
            config={},
            tags={"loop": ["east"]} if id_ in ("a", "meter") else {},
            attributes={
                "setpoint": Attribute.create(
                    "setpoint",
                    DataType.FLOAT,
                    {"read"} if id_ == "meter" else {"read", "write"},
                    value=20,
                )
            },
        )
        for id_ in ("a", "b", "meter")
    }
    dm = MagicMock(spec=DevicesServiceInterface)
    dm.list_devices.side_effect = lambda **kwargs: [
        d for d in devices.values() if d.tags.get("loop") == kwargs["tags"]["loop"]
    ]
    commands = CommandsService(
        None, AsyncMock(), AsyncMock(), CompositeTargetResolver(dm)
    )
    await commands.start()
    try:
        template = await commands.save_template(
            CommandTemplateCreate(
                name="Comfort",
                target=DevicesFilter(tags={"loop": ["east"]}),
                write=AttributeWrite(
                    attribute="setpoint", value=24, data_type=DataType.FLOAT
                ),
            ),
            "operator",
        )
        providers = {"command_template": CommandsActionProvider(commands, MagicMock())}
        group, direct = (
            Automation(
                id=id_,
                name=id_,
                trigger=Trigger(provider_id="schedule"),
                branches=[
                    AutomationBranch(
                        action=Action(provider_id="command_template", params=params)
                    )
                ],
            )
            for id_, params in [
                ("group", {"template_id": template.id}),
                ("direct", {"device_id": "b", "attribute": "setpoint", "value": 18}),
            ]
        )

        # The read-only member is left out, exactly as a dispatch leaves it out.
        assert [w.device_id for w in await describe_writes(group, providers)] == ["a"]
        assert await diagnose(group, [direct], providers) == []

        devices["b"].tags = {"loop": ["east"]}
        conflicts = await diagnose(group, [direct], providers)
        assert [
            (c.code, c.target.device_id, c.other_automation_id) for c in conflicts
        ] == [("potential_write_conflict", "b", "direct")]

        # A group no dispatch can write to (no writable member) writes nothing.
        devices["a"].tags = devices["b"].tags = {}
        assert await describe_writes(group, providers) == []
        assert await diagnose(group, [direct], providers) == []
    finally:
        await commands.stop()
