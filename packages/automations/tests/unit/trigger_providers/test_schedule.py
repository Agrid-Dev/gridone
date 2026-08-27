from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from zoneinfo import ZoneInfo

import pytest
from automations.trigger_providers.schedule import (
    ScheduleListener,
    ScheduleTriggerProvider,
)
from croniter import croniter

CRONITER_TARGET = "automations.trigger_providers.schedule.croniter"


class TestScheduleListener:
    pytestmark = pytest.mark.asyncio

    async def test_stop_before_start_is_safe(self):
        listener = ScheduleListener("* * * * *", AsyncMock())
        await listener.stop()  # must not raise

    async def test_start_creates_task_and_stop_cancels_it(self):
        listener = ScheduleListener("* * * * *", AsyncMock())
        await listener.start()
        assert listener._task is not None  # noqa: SLF001
        await listener.stop()
        assert listener._task is None  # noqa: SLF001

    async def test_on_fire_called_when_cron_fires(self):
        fired = asyncio.Event()

        async def on_fire(_ctx: object) -> None:
            fired.set()
            await asyncio.sleep(0)

        listener = ScheduleListener("* * * * *", on_fire)
        past_dt = datetime.now(UTC) - timedelta(seconds=1)
        mock_cron = MagicMock()
        mock_cron.get_next.return_value = past_dt
        with patch(CRONITER_TARGET, return_value=mock_cron):
            await listener.start()
            await asyncio.wait_for(fired.wait(), timeout=0.5)
            await listener.stop()
        assert fired.is_set()


class TestScheduleListenerTimezone:
    """A schedule means a wall-clock time at the building, not on the server."""

    pytestmark = pytest.mark.asyncio

    @staticmethod
    async def _captured_base(tz: ZoneInfo | None) -> datetime:
        """Start a listener and return the ``now`` it seeded croniter with."""
        captured: dict[str, datetime] = {}

        def spy(expression: str, base: datetime) -> croniter:
            captured["base"] = base
            return croniter(expression, base)

        listener = (
            ScheduleListener("0 9 * * *", AsyncMock(), tz)
            if tz is not None
            else ScheduleListener("0 9 * * *", AsyncMock())
        )
        with patch(CRONITER_TARGET, side_effect=spy):
            await listener.start()
            # Let _run reach its first croniter() call before tearing down.
            await asyncio.sleep(0)
            await listener.stop()
        return captured["base"]

    async def test_cron_is_read_in_the_configured_timezone(self):
        paris = ZoneInfo("Europe/Paris")
        base = await self._captured_base(paris)

        assert base.tzinfo is paris
        # The whole point: "0 9 * * *" resolves to 09:00 in Paris, which is
        # 07:00Z in summer — not 09:00Z, which used to fire at 11:00 local.
        occurrence = croniter("0 9 * * *", datetime(2026, 8, 12, 7, tzinfo=paris))
        next_dt = occurrence.get_next(datetime)
        assert next_dt.hour == 9
        assert next_dt.astimezone(UTC).hour == 7

    async def test_occurrence_keeps_its_wall_clock_time_across_dst(self):
        paris = ZoneInfo("Europe/Paris")
        # Paris leaves DST at 03:00 on 2026-10-25, so a base of the 23rd puts
        # one 09:00 on each side: 07:00Z before, 08:00Z after. A UTC-evaluated
        # cron would instead hold 09:00Z and drift to 10:00 local.
        it = croniter("0 9 * * *", datetime(2026, 10, 23, 12, tzinfo=paris))
        before = it.get_next(datetime)  # Oct 24, still +02:00
        after = it.get_next(datetime)  # Oct 25, now +01:00

        assert (before.hour, after.hour) == (9, 9)
        assert before.astimezone(UTC).hour == 7
        assert after.astimezone(UTC).hour == 8

    async def test_defaults_to_utc_when_unconfigured(self):
        base = await self._captured_base(None)
        assert base.tzinfo is UTC


class TestScheduleTriggerProviderConfig:
    def test_has_params_schema(self):
        provider = ScheduleTriggerProvider()
        assert "cron" in provider.params_model.model_json_schema()["properties"]

    def test_resolves_the_deployment_timezone(self):
        assert ScheduleTriggerProvider("Europe/Paris")._tz == ZoneInfo(  # noqa: SLF001
            "Europe/Paris"
        )
        assert ScheduleTriggerProvider()._tz == ZoneInfo("UTC")  # noqa: SLF001


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
        assert handle_id in provider._listeners  # noqa: SLF001
        assert provider._listeners[handle_id]._task is not None  # noqa: SLF001
        await provider.unregister(handle_id)

    async def test_unregister_stops_and_removes_listener(self):
        provider = ScheduleTriggerProvider()
        handle_id = await provider.register({"cron": "* * * * *"}, AsyncMock())
        await provider.unregister(handle_id)
        assert handle_id not in provider._listeners  # noqa: SLF001

    async def test_unregister_unknown_handle_is_safe(self):
        provider = ScheduleTriggerProvider()
        await provider.unregister("nonexistent")  # must not raise

    async def test_multiple_registrations_are_independent(self):
        provider = ScheduleTriggerProvider()
        on_fire = AsyncMock()
        h1 = await provider.register({"cron": "* * * * *"}, on_fire)
        h2 = await provider.register({"cron": "0 11 * * *"}, on_fire)
        assert h1 != h2
        assert len(provider._listeners) == 2  # noqa: SLF001
        await provider.unregister(h1)
        assert len(provider._listeners) == 1  # noqa: SLF001
        await provider.unregister(h2)

    async def test_invalid_cron_raises(self):
        provider = ScheduleTriggerProvider()
        with pytest.raises(ValueError, match="Invalid cron expression"):
            await provider.register({"cron": "not-a-cron"}, AsyncMock())

    async def test_listeners_inherit_the_provider_timezone(self):
        provider = ScheduleTriggerProvider("Europe/Paris")
        handle_id = await provider.register({"cron": "0 9 * * *"}, AsyncMock())
        listener = provider._listeners[handle_id]  # noqa: SLF001
        assert listener._tz == ZoneInfo("Europe/Paris")  # noqa: SLF001
        await provider.unregister(handle_id)
