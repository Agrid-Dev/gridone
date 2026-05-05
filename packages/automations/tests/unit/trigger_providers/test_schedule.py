from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from automations.trigger_providers.schedule import (
    ScheduleListener,
    ScheduleTriggerProvider,
)


class TestScheduleListener:
    pytestmark = pytest.mark.asyncio

    async def test_stop_before_start_is_safe(self):
        listener = ScheduleListener("* * * * *", AsyncMock())
        await listener.stop()  # must not raise

    async def test_start_creates_task_and_stop_cancels_it(self):
        listener = ScheduleListener("* * * * *", AsyncMock())
        await listener.start()
        assert listener.is_running
        await listener.stop()
        assert not listener.is_running

    async def test_on_fire_called_when_cron_fires(self):
        fired = asyncio.Event()

        async def on_fire(_ctx: object) -> None:
            fired.set()
            await asyncio.sleep(0)

        listener = ScheduleListener("* * * * *", on_fire)
        past_dt = datetime.now(UTC) - timedelta(seconds=1)
        mock_cron = MagicMock()
        mock_cron.get_next.return_value = past_dt
        target = "automations.trigger_providers.schedule.croniter"
        with patch(target, return_value=mock_cron):
            await listener.start()
            await asyncio.wait_for(fired.wait(), timeout=0.5)
            await listener.stop()
        assert fired.is_set()


class TestScheduleTriggerProviderConfig:
    def test_has_params_schema(self):
        provider = ScheduleTriggerProvider()
        assert "cron" in provider.params_schema["properties"]


class TestScheduleTriggerProvider:
    pytestmark = pytest.mark.asyncio

    async def test_register_returns_handle_id(self):
        provider = ScheduleTriggerProvider()
        handle_id = await provider.register({"cron": "* * * * *"}, AsyncMock())
        assert isinstance(handle_id, str)
        assert len(handle_id) > 0
        await provider.unregister(handle_id)

    async def test_register_starts_listener(self):
        provider = ScheduleTriggerProvider()
        handle_id = await provider.register({"cron": "* * * * *"}, AsyncMock())
        assert provider.is_handle_running(handle_id)
        await provider.unregister(handle_id)

    async def test_unregister_stops_and_removes_listener(self):
        provider = ScheduleTriggerProvider()
        handle_id = await provider.register({"cron": "* * * * *"}, AsyncMock())
        await provider.unregister(handle_id)
        assert not provider.has_handle(handle_id)

    async def test_unregister_unknown_handle_is_safe(self):
        provider = ScheduleTriggerProvider()
        await provider.unregister("nonexistent")  # must not raise

    async def test_multiple_registrations_are_independent(self):
        provider = ScheduleTriggerProvider()
        on_fire = AsyncMock()
        h1 = await provider.register({"cron": "* * * * *"}, on_fire)
        h2 = await provider.register({"cron": "0 11 * * *"}, on_fire)
        assert h1 != h2
        assert provider.handle_count == 2
        await provider.unregister(h1)
        assert provider.handle_count == 1
        await provider.unregister(h2)

    async def test_invalid_cron_raises(self):
        provider = ScheduleTriggerProvider()
        with pytest.raises(ValueError, match="Invalid cron expression"):
            await provider.register({"cron": "not-a-cron"}, AsyncMock())
