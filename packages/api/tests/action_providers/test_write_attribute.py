from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from automations.errors import AutomationLoopError
from automations.models import Trigger, TriggerContext
from pydantic import ValidationError

from api.action_providers.write_attribute import (
    WriteAttributeAction,
    WriteAttributeActionProvider,
)
from commands.interface import CommandsServiceInterface
from models.attribute_observation import AttributeDefinition, AttributeObservation
from models.errors import InvalidError, WriteRejectedError
from models.types import DataType
from models.write_rules import WriteReason

pytestmark = pytest.mark.asyncio


@pytest.fixture
def provider():
    commands = AsyncMock(spec=CommandsServiceInterface)
    inspect = MagicMock(
        return_value=AttributeDefinition(
            data_type=DataType.BOOL, writable=True, max_age_seconds=None
        )
    )
    resolve = MagicMock(return_value=AttributeObservation(validity="known", value=True))
    return (
        WriteAttributeActionProvider(commands, inspect, resolve),
        commands,
        inspect,
        resolve,
    )


def event():
    return TriggerContext(
        timestamp=datetime.now(UTC),
        device_id="a",
        attribute="fault",
        previous_value=False,
        value=True,
        has_previous=True,
    )


async def test_writes_event_device_through_command_service(provider):
    action, commands, _, _ = provider
    output = await action.execute({"attribute": "running", "value": False}, event())
    kwargs = commands.dispatch_unit.call_args.kwargs
    assert kwargs["device_id"] == "a"
    assert kwargs["write"].value is False
    assert kwargs["write"].data_type == DataType.BOOL
    assert kwargs["confirm"] is False
    assert kwargs["batch_id"] == output
    assert "consent" not in kwargs


async def test_event_and_cross_device_value_expressions(provider):
    action, commands, _, resolve = provider
    await action.execute(
        {
            "device_id": "b",
            "attribute": "running",
            "value": {"event": "previous_value"},
        },
        event(),
    )
    assert commands.dispatch_unit.call_args.kwargs["write"].value is False
    await action.execute(
        {
            "device_id": "b",
            "attribute": "running",
            "value": {"device_id": "c", "attribute": "running"},
        },
        event(),
    )
    assert commands.dispatch_unit.call_args.kwargs["write"].value is True
    resolve.assert_called_once()


async def test_direct_feedback_prevented_before_write(provider):
    action, commands, _, _ = provider
    with pytest.raises(AutomationLoopError):
        await action.execute({"attribute": "fault", "value": False}, event())
    commands.dispatch_unit.assert_not_awaited()


async def test_protection_refusal_propagates_without_retry(provider):
    action, commands, _, _ = provider
    commands.dispatch_unit.side_effect = WriteRejectedError(
        [WriteReason(code="operating_rule_blocked")]
    )
    with pytest.raises(WriteRejectedError):
        await action.execute({"attribute": "running", "value": False}, event())
    commands.dispatch_unit.assert_awaited_once()


@pytest.mark.parametrize(
    "case", ["missing_device", "missing_target", "read_only", "unknown_value"]
)
async def test_unavailable_inputs_do_not_write(provider, case):
    action, commands, inspect, resolve = provider
    context = event()
    params: dict = {"attribute": "running", "value": False}
    if case == "missing_device":
        context.device_id = None
    elif case == "missing_target":
        inspect.return_value = None
    elif case == "read_only":
        inspect.return_value.writable = False
    else:
        params["value"] = {"device_id": "b", "attribute": "running"}
        resolve.return_value = AttributeObservation(validity="unknown")
    with pytest.raises(InvalidError):
        await action.execute(params, context)
    commands.dispatch_unit.assert_not_awaited()


@pytest.mark.parametrize("value", [{"candidate": True}, {"attribute": "sibling"}, None])
async def test_values_require_explicit_references(value):
    with pytest.raises(ValidationError):
        WriteAttributeAction(attribute="running", value=value)


@pytest.mark.parametrize(
    ("device_id", "value", "expected_value"),
    [(None, False, False), ("b", {"event": "value"}, None)],
)
async def test_describes_known_write_target(provider, device_id, value, expected_value):
    action, _, _, _ = provider
    writes = await action.describe_writes(
        {"device_id": device_id, "attribute": "running", "value": value},
        Trigger(provider_id="change_event", params={"device_id": "a"}),
    )
    assert writes[0].device_id == (device_id or "a")
    assert writes[0].value == expected_value
    assert (
        await action.describe_writes(
            {"attribute": "running", "value": False}, Trigger(provider_id="schedule")
        )
        == []
    )
