from unittest.mock import AsyncMock, MagicMock

import pytest
from automations.models import (
    Action,
    Automation,
    AutomationBranch,
    AutomationWrite,
    Trigger,
)
from automations.references import references_device

pytestmark = pytest.mark.asyncio


@pytest.mark.parametrize("source", ["trigger", "action", "condition", "template"])
async def test_finds_references_in_every_part_of_nested_decisions(source):
    action = Action(
        provider_id="write",
        params={"device_id": "target"} if source == "action" else {},
    )
    branch = AutomationBranch.model_validate(
        {
            "condition": {
                "op": "eq",
                "left": {"device_id": "target", "attribute": "missing"},
                "right": True,
            }
            if source == "condition"
            else None,
            "action": action,
        }
    )
    automation = Automation(
        name="Nested",
        enabled=False,
        trigger=Trigger(
            provider_id="event",
            params={"device_id": "target"} if source == "trigger" else {},
        ),
        branches=[AutomationBranch(branches=[branch])],
    )
    provider = MagicMock(
        describe_writes=AsyncMock(
            return_value=[AutomationWrite(device_id="target", attribute="running")]
            if source == "template"
            else []
        )
    )
    assert await references_device(automation, "target", {"write": provider})
    assert not await references_device(automation, "unrelated", {"write": provider})
    provider.execute.assert_not_called()


async def test_missing_provider_does_not_hide_literal_references():
    automation = Automation(
        name="Unavailable provider",
        trigger=Trigger(provider_id="schedule"),
        branches=[
            AutomationBranch(
                action=Action(provider_id="removed", params={"device_id": "deleted"})
            )
        ],
    )
    assert await references_device(automation, "deleted", {})
    assert not await references_device(automation, "other", {})


async def test_template_targets_are_resolved_again_after_an_edit():
    provider = MagicMock(
        describe_writes=AsyncMock(
            return_value=[AutomationWrite(device_id="old", attribute="running")]
        )
    )
    automation = Automation(
        name="Template",
        trigger=Trigger(provider_id="schedule"),
        branches=[AutomationBranch(action=Action(provider_id="write"))],
    )
    assert await references_device(automation, "old", {"write": provider})
    provider.describe_writes.return_value = [
        AutomationWrite(device_id="new", attribute="running")
    ]
    assert not await references_device(automation, "old", {"write": provider})
    assert await references_device(automation, "new", {"write": provider})
