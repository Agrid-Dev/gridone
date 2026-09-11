from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from automations import Automation, AutomationsServiceInterface
from automations.models import Action, Trigger

from api.group_references import GroupReferences
from commands import AttributeWrite, CommandsServiceInterface, CommandTemplate
from devices_manager import DevicesServiceInterface
from models.errors import NotFoundError
from models.pagination import Page
from models.targets import DevicesFilter
from models.types import DataType

pytestmark = pytest.mark.asyncio


def template(id_: str, *, group_id: str = "group", name: str | None = "Saved"):
    return CommandTemplate(
        id=id_,
        name=name,
        target=DevicesFilter(group_id=group_id),
        write=AttributeWrite(attribute="setpoint", value=25, data_type=DataType.FLOAT),
        created_at=datetime.now(UTC),
        created_by="user",
    )


async def test_named_templates_and_disabled_automations_block_but_history_does_not():
    dm = MagicMock(spec=DevicesServiceInterface)
    commands = AsyncMock(spec=CommandsServiceInterface)
    automations = AsyncMock(spec=AutomationsServiceInterface)
    saved = template("saved")
    ephemeral = template("ephemeral", name=None)
    commands.list_templates.return_value = Page(items=[saved], total=1, page=1, size=1)
    commands.get_template.side_effect = lambda id_: (
        ephemeral if id_ == "ephemeral" else saved
    )
    automations.list.return_value = [
        Automation(
            id="automation",
            name="Comfort",
            enabled=False,
            trigger=Trigger(provider_id="schedule"),
            action=Action(
                provider_id="command_template", params={"template_id": "ephemeral"}
            ),
        )
    ]
    refs = await GroupReferences(dm, commands, automations).list("group")
    assert [(r.kind, r.id) for r in refs] == [
        ("command_template", "saved"),
        ("automation", "automation"),
    ]
    assert await GroupReferences(dm, commands, automations).list("other-group") == []


async def test_unrelated_and_stale_actions_do_not_block():
    dm = MagicMock(spec=DevicesServiceInterface)
    commands = AsyncMock(spec=CommandsServiceInterface)
    commands.list_templates.return_value = Page(items=[], total=0, page=1, size=1)
    commands.get_template.side_effect = NotFoundError("Missing template")
    automations = AsyncMock(spec=AutomationsServiceInterface)
    actions = [
        Action(provider_id="notification"),
        Action(provider_id="command_template"),
        Action(provider_id="command_template", params={"template_id": "missing"}),
    ]
    automations.list.return_value = [
        Automation(
            id=str(i),
            name="Other",
            trigger=Trigger(provider_id="schedule"),
            action=action,
        )
        for i, action in enumerate(actions)
    ]
    assert await GroupReferences(dm, commands, automations).list("group") == []
    assert await GroupReferences(dm, commands).list("group") == []


async def test_action_validation_refuses_unknown_group_reference():
    dm = MagicMock(spec=DevicesServiceInterface)
    dm.get_group.side_effect = NotFoundError("Missing group")
    commands = AsyncMock(spec=CommandsServiceInterface)
    commands.get_template.return_value = template("ephemeral", name=None)
    references = GroupReferences(dm, commands)
    with pytest.raises(NotFoundError):
        await references.validate_action(
            Action(provider_id="command_template", params={"template_id": "ephemeral"})
        )
    await references.validate_action(Action(provider_id="notification"))
    await references.validate_action(Action(provider_id="command_template"))
    commands.get_template.assert_awaited_once()
