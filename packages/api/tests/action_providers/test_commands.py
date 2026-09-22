from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from automations.errors import AutomationLoopError
from automations.models import Trigger, TriggerContext
from pydantic import ValidationError

from api.action_providers.commands import CommandsActionProvider
from commands.interface import CommandsServiceInterface
from commands.models import AttributeWrite, BatchCommandDispatch, CommandTemplate
from models.errors import InvalidError, NotFoundError
from models.targets import DevicesFilter
from models.types import DataType


def _commands_service(batch_id: str = "batch-abc") -> AsyncMock:
    dispatch = BatchCommandDispatch(batch_id=batch_id, commands=[MagicMock()])
    svc = AsyncMock(spec=CommandsServiceInterface)
    svc.get_template.return_value = CommandTemplate(
        id="tmpl-01",
        name="Comfort",
        target=DevicesFilter(ids=["device"]),
        write=AttributeWrite(attribute="mode", value="auto", data_type=DataType.STRING),
        created_at=datetime.now(UTC),
        created_by="operator",
    )
    svc.dispatch_template = AsyncMock(return_value=dispatch)
    return svc


class TestCommandsActionProvider:
    def test_has_params_schema(self):
        provider = CommandsActionProvider(_commands_service())
        assert "properties" in provider.params_model.model_json_schema()

    def test_params_model_accepts_valid_params(self):
        provider = CommandsActionProvider(_commands_service())
        provider.params_model(template_id="tmpl-01")  # must not raise

    def test_params_model_rejects_missing_template_id(self):
        provider = CommandsActionProvider(_commands_service())
        with pytest.raises(ValidationError):
            provider.params_model()

    @pytest.mark.asyncio
    async def test_execute_dispatches_and_returns_batch_id(self):
        svc = _commands_service(batch_id="batch-xyz")
        provider = CommandsActionProvider(svc)
        result = await provider.execute({"template_id": "tmpl-01"})
        svc.get_template.assert_awaited_once_with("tmpl-01")
        svc.dispatch_template.assert_awaited_once_with(
            template=svc.get_template.return_value,
            user_id="system",
            confirm=False,
        )
        assert result == "batch-xyz"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "failure", [None, NotFoundError("missing"), InvalidError("invalid")]
)
async def test_empty_or_invalid_group_is_explicit(failure):
    from models.action_failure import ActionExecutionError

    svc = _commands_service()
    svc.get_template.return_value.target = DevicesFilter(tags={"loop": ["east"]})
    svc.dispatch_template.return_value = BatchCommandDispatch(
        batch_id="empty", commands=[]
    )
    svc.dispatch_template.side_effect = failure
    provider = CommandsActionProvider(svc)
    with pytest.raises(ActionExecutionError) as error:
        await provider.execute({"template_id": "tmpl-01"})
    assert error.value.details.code == (
        "empty_target" if failure is None else "invalid_target"
    )
    assert error.value.details.target.tags == {"loop": ["east"]}


@pytest.mark.asyncio
async def test_template_cannot_write_its_own_trigger_point():
    svc = _commands_service()
    provider = CommandsActionProvider(svc)
    with pytest.raises(AutomationLoopError):
        await provider.execute(
            {"template_id": "tmpl-01"},
            TriggerContext(
                timestamp=datetime.now(UTC), device_id="device", attribute="mode"
            ),
        )
    svc.dispatch_template.assert_not_awaited()


@pytest.mark.asyncio
async def test_template_describes_only_known_targets():
    svc = _commands_service()
    provider = CommandsActionProvider(svc)
    trigger = Trigger(provider_id="schedule")
    writes = await provider.describe_writes({"template_id": "tmpl-01"}, trigger)
    assert writes[0].device_id == "device"
    assert writes[0].value == "auto"
    svc.get_template.return_value.target = DevicesFilter(tags={"loop": ["east"]})
    assert await provider.describe_writes({"template_id": "tmpl-01"}, trigger) == []
    svc.get_template.side_effect = NotFoundError("missing")
    assert await provider.describe_writes({"template_id": "tmpl-01"}, trigger) == []
