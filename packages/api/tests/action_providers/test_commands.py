from unittest.mock import AsyncMock

import pytest
from commands.interface import CommandsServiceInterface
from commands.models import BatchCommandDispatch

from api.action_providers.commands import CommandAction, CommandsActionProvider


def _commands_service(batch_id: str = "batch-abc") -> AsyncMock:
    dispatch = BatchCommandDispatch(batch_id=batch_id, commands=[])
    svc = AsyncMock(spec=CommandsServiceInterface)
    svc.dispatch_from_template = AsyncMock(return_value=dispatch)
    return svc


class TestCommandsActionProvider:
    def test_provider_id(self):
        svc = _commands_service()
        provider = CommandsActionProvider(svc)
        assert provider.id == "command_template"

    def test_action_schema(self):
        svc = _commands_service()
        provider = CommandsActionProvider(svc)
        assert isinstance(provider.action_schema, dict)
        assert "properties" in provider.action_schema

    @pytest.mark.asyncio
    async def test_execute_calls_dispatch_from_template(self):
        svc = _commands_service()
        provider = CommandsActionProvider(svc)
        result = await provider.execute({"template_id": "tmpl-01"})
        svc.dispatch_from_template.assert_awaited_once_with(
            template_id="tmpl-01",
            user_id="system",
            confirm=False,
        )
        assert result == "batch-abc"

    @pytest.mark.asyncio
    async def test_execute_returns_batch_id(self):
        svc = _commands_service(batch_id="batch-xyz")
        provider = CommandsActionProvider(svc)
        result = await provider.execute({"template_id": "tmpl-01"})
        assert result == "batch-xyz"

    def test_command_action_model_json_schema(self):
        schema = CommandAction.model_json_schema()
        assert "template_id" in schema["properties"]
