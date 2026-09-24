from unittest.mock import AsyncMock, MagicMock

import pytest
from automations.diagnostics import diagnose
from automations.models import (
    Action,
    Automation,
    AutomationBranch,
    AutomationWrite,
    Trigger,
)

pytestmark = pytest.mark.asyncio


def automation(identifier, value, *, enabled=True):
    return Automation(
        id=identifier,
        name=identifier,
        enabled=enabled,
        trigger=Trigger(
            provider_id="change_event", params={"device_id": "a", "attribute": "fault"}
        ),
        branches=[
            AutomationBranch(
                action=Action(provider_id="write", params={"value": value})
            )
        ],
    )


@pytest.fixture
def providers():
    async def writes(params, _trigger) -> list[AutomationWrite]:
        return [
            AutomationWrite(device_id="a", attribute="running", value=params["value"])
        ]

    return {"write": MagicMock(describe_writes=AsyncMock(side_effect=writes))}


async def test_opposing_static_writes_warn_once(providers):
    own, other = automation("own", value=True), automation("other", value=False)
    own.branches.append(AutomationBranch(action=own.branches[0].action))
    result = await diagnose(own, [own, other], providers)
    assert len(result) == 1
    assert result[0].code == "potential_write_conflict"
    assert result[0].other_automation_id == "other"
    assert result[0].target.attribute == "running"


@pytest.mark.parametrize(
    ("value", "enabled"), [(True, True), (None, True), (False, False)]
)
async def test_equal_unknown_or_inactive_writes_do_not_warn(providers, value, enabled):
    assert (
        await diagnose(
            automation("own", value=True),
            [automation("other", value, enabled=enabled)],
            providers,
        )
        == []
    )


async def test_direct_feedback_is_reported(providers):
    own = automation("own", value=True)
    own.trigger.params["attribute"] = "running"
    result = await diagnose(own, [], providers)
    assert result[0].code == "direct_feedback"


async def test_missing_provider_has_no_statically_known_writes():
    assert await diagnose(automation("own", value=True), [], {}) == []
