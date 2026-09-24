from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from automations.models import Trigger, TriggerContext
from pydantic import ValidationError

from api.action_providers.commands import CommandAction, CommandsActionProvider
from commands.interface import CommandsServiceInterface
from commands.models import AttributeWrite, BatchCommandDispatch, CommandTemplate
from models.action_failure import ActionExecutionError
from models.attribute_observation import AttributeDefinition
from models.errors import InvalidError, NotFoundError, WriteRejectedError
from models.targets import DevicesFilter
from models.types import DataType
from models.write_rules import WriteReason


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


def _inspector(*, writable: bool = True) -> MagicMock:
    return MagicMock(
        return_value=AttributeDefinition(
            data_type=DataType.BOOL, writable=writable, max_age_seconds=None
        )
    )


def _provider(
    svc: AsyncMock | None = None, inspect: MagicMock | None = None
) -> CommandsActionProvider:
    return CommandsActionProvider(svc or _commands_service(), inspect or _inspector())


def _event() -> TriggerContext:
    return TriggerContext(
        timestamp=datetime.now(UTC),
        device_id="a",
        attribute="fault",
        previous_value=False,
        value=True,
        has_previous=True,
    )


class TestCommandActionShape:
    def test_has_params_schema(self):
        assert "properties" in _provider().params_model.model_json_schema()

    @pytest.mark.parametrize(
        "params",
        [
            {"template_id": "tmpl-01"},
            {"attribute": "running", "value": False},
            {"device_id": "b", "attribute": "running", "value": 21.5},
        ],
    )
    def test_accepts_a_template_or_an_inline_write(self, params):
        CommandAction(**params)  # must not raise

    @pytest.mark.parametrize(
        "params",
        [
            {},
            {"attribute": "running"},
            {"value": True},
            {"device_id": "b"},
            {"template_id": "tmpl-01", "attribute": "running", "value": True},
            {"template_id": "tmpl-01", "device_id": "b"},
            {"template_id": ""},
            {"attribute": "", "value": True},
        ],
    )
    def test_rejects_a_mixed_or_incomplete_shape(self, params):
        with pytest.raises(ValidationError):
            CommandAction(**params)


class TestTemplateCommand:
    pytestmark = pytest.mark.asyncio

    async def test_execute_dispatches_and_returns_batch_id(self):
        svc = _commands_service(batch_id="batch-xyz")
        result = await _provider(svc).execute({"template_id": "tmpl-01"})
        svc.get_template.assert_awaited_once_with("tmpl-01")
        svc.dispatch_template.assert_awaited_once_with(
            template=svc.get_template.return_value,
            user_id="system",
            confirm=False,
        )
        svc.dispatch_unit.assert_not_awaited()
        assert result == "batch-xyz"

    @pytest.mark.parametrize(
        "failure", [None, NotFoundError("missing"), InvalidError("invalid")]
    )
    async def test_empty_or_invalid_group_is_explicit(self, failure):
        svc = _commands_service()
        svc.get_template.return_value.target = DevicesFilter(tags={"loop": ["east"]})
        svc.dispatch_template.return_value = BatchCommandDispatch(
            batch_id="empty", commands=[]
        )
        svc.dispatch_template.side_effect = failure
        with pytest.raises(ActionExecutionError) as error:
            await _provider(svc).execute({"template_id": "tmpl-01"})
        assert error.value.details.code == (
            "empty_target" if failure is None else "invalid_target"
        )
        assert error.value.details.target.tags == {"loop": ["east"]}

    async def test_template_describes_only_known_targets(self):
        svc = _commands_service()
        provider = _provider(svc)
        trigger = Trigger(provider_id="schedule")
        writes = await provider.describe_writes({"template_id": "tmpl-01"}, trigger)
        assert writes[0].device_id == "device"
        assert writes[0].value == "auto"
        svc.get_template.return_value.target = DevicesFilter(tags={"loop": ["east"]})
        assert await provider.describe_writes({"template_id": "tmpl-01"}, trigger) == []
        svc.get_template.side_effect = NotFoundError("missing")
        assert await provider.describe_writes({"template_id": "tmpl-01"}, trigger) == []


class TestInlineWrite:
    pytestmark = pytest.mark.asyncio

    async def test_writes_the_event_device_through_the_command_service(self):
        svc = _commands_service()
        output = await _provider(svc).execute(
            {"attribute": "running", "value": False}, _event()
        )
        kwargs = svc.dispatch_unit.call_args.kwargs
        assert kwargs["device_id"] == "a"
        assert kwargs["write"].value is False
        assert kwargs["write"].data_type == DataType.BOOL
        assert kwargs["confirm"] is False
        assert kwargs["batch_id"] == output
        assert "consent" not in kwargs
        # The automation's own act, never an operator's: history must say so.
        assert kwargs["user_id"] == "system"
        svc.dispatch_template.assert_not_awaited()

    async def test_writes_an_explicit_device_without_an_event(self):
        svc = _commands_service()
        await _provider(svc).execute(
            {"device_id": "b", "attribute": "running", "value": True}
        )
        assert svc.dispatch_unit.call_args.kwargs["device_id"] == "b"

    async def test_protection_refusal_propagates_without_retry(self):
        svc = _commands_service()
        svc.dispatch_unit.side_effect = WriteRejectedError(
            [WriteReason(code="operating_rule_blocked")]
        )
        with pytest.raises(WriteRejectedError):
            await _provider(svc).execute(
                {"attribute": "running", "value": False}, _event()
            )
        svc.dispatch_unit.assert_awaited_once()

    @pytest.mark.parametrize("case", ["missing_device", "missing_target", "read_only"])
    async def test_unavailable_inputs_do_not_write(self, case):
        svc, inspect = _commands_service(), _inspector()
        context = _event()
        if case == "missing_device":
            context = TriggerContext(timestamp=datetime.now(UTC))
        elif case == "missing_target":
            inspect.return_value = None
        else:
            inspect.return_value.writable = False
        with pytest.raises(InvalidError):
            await _provider(svc, inspect).execute(
                {"attribute": "running", "value": False}, context
            )
        svc.dispatch_unit.assert_not_awaited()

    @pytest.mark.parametrize(("device_id", "expected"), [(None, "a"), ("b", "b")])
    async def test_describes_the_inline_write_target(self, device_id, expected):
        provider = _provider()
        writes = await provider.describe_writes(
            {"device_id": device_id, "attribute": "running", "value": False},
            Trigger(provider_id="change_event", params={"device_id": "a"}),
        )
        assert writes[0].device_id == expected
        assert writes[0].attribute == "running"
        assert writes[0].value is False
        assert (
            await provider.describe_writes(
                {"attribute": "running", "value": False},
                Trigger(provider_id="schedule"),
            )
            == []
        )
