from unittest.mock import AsyncMock

import pytest
from pydantic import ValidationError

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
        svc.dispatch_from_template.assert_awaited_once_with(
            template_id="tmpl-01",
            user_id="system",
            confirm=False,
        )
        assert result == "batch-xyz"
