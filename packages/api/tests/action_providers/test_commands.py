from unittest.mock import AsyncMock

import pytest

from api.action_providers.commands import CommandsActionProvider
from commands.interface import CommandsServiceInterface
from commands.models import BatchCommandDispatch


def _commands_service(batch_id: str = "batch-abc") -> AsyncMock:
    dispatch = BatchCommandDispatch(batch_id=batch_id, commands=[])
    svc = AsyncMock(spec=CommandsServiceInterface)
    svc.dispatch_from_template = AsyncMock(return_value=dispatch)
    return svc


class TestCommandsActionProvider:
    def test_has_params_schema(self):
        provider = CommandsActionProvider(_commands_service())
        assert "properties" in provider.params_schema

    @pytest.mark.asyncio
    async def test_execute_dispatches_and_returns_batch_id(self):
        svc = _commands_service(batch_id="batch-xyz")
        provider = CommandsActionProvider(svc)
        result = await provider.execute({"template_id": "tmpl-01"})
        svc.dispatch_from_template.assert_awaited_once_with(
            template_id="tmpl-01",
            user_id="system",
            confirm=False,
        )
        assert result == "batch-xyz"
