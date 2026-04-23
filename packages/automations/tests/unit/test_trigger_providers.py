from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from automations.models import (
    ChangeEventTrigger,
    Condition,
    ConditionOperator,
    ScheduleTrigger,
    TriggerContext,
)
from automations.trigger_providers.change_event import (
    ChangeEventTriggerProvider,
    _evaluate,
)
from automations.trigger_providers.composite import CompositeTriggerListenerFactory
from automations.trigger_providers.schedule import ScheduleListener

_TRIGGER = ChangeEventTrigger(source_id="dev-01", event_type="temperature")
_NOW = datetime(2024, 1, 1, tzinfo=UTC)


def _make_event_bus() -> MagicMock:
    bus = MagicMock()
    bus.subscribe = MagicMock()
    bus.unsubscribe = MagicMock()
    return bus


class TestEvaluate:
    @pytest.mark.parametrize(
        ("op", "threshold", "value", "expected"),
        [
            (ConditionOperator.GT, 25, 30, True),
            (ConditionOperator.GT, 25, 25, False),
            (ConditionOperator.LT, 25, 20, True),
            (ConditionOperator.LT, 25, 25, False),
            (ConditionOperator.GTE, 25, 25, True),
            (ConditionOperator.GTE, 25, 24, False),
            (ConditionOperator.LTE, 25, 25, True),
            (ConditionOperator.LTE, 25, 26, False),
            (ConditionOperator.EQ, 1, 1, True),
            (ConditionOperator.EQ, 1, 0, False),
            (ConditionOperator.NE, 1, 0, True),
            (ConditionOperator.NE, 1, 1, False),
        ],
    )
    def test_operator(self, op, threshold, value, expected):
        c = Condition(operator=op, threshold=threshold)
        assert _evaluate(c, value) is expected

    def test_none_value_returns_false(self):
        c = Condition(operator=ConditionOperator.GT, threshold=10)
        assert _evaluate(c, None) is False

    def test_incompatible_types_returns_false(self):
        c = Condition(operator=ConditionOperator.GT, threshold=10)
        assert _evaluate(c, "not-a-number") is False


class TestChangeEventListener:
    pytestmark = pytest.mark.asyncio

    async def test_start_subscribes_to_bus(self):
        bus = _make_event_bus()
        listener = ChangeEventTriggerProvider(bus).build(_TRIGGER, AsyncMock())
        await listener.start()
        bus.subscribe.assert_called_once_with(listener._handle)

    async def test_stop_unsubscribes_from_bus(self):
        bus = _make_event_bus()
        listener = ChangeEventTriggerProvider(bus).build(_TRIGGER, AsyncMock())
        await listener.start()
        await listener.stop()
        bus.unsubscribe.assert_called_once_with(listener._handle)

    async def test_fires_on_matching_source_and_event(self):
        on_fire = AsyncMock()
        bus = _make_event_bus()
        listener = ChangeEventTriggerProvider(bus).build(_TRIGGER, on_fire)
        await listener._handle("dev-01", "temperature", 30, _NOW)
        on_fire.assert_called_once()
        ctx: TriggerContext = on_fire.call_args[0][0]
        assert ctx.value == 30
        assert ctx.timestamp == _NOW

    async def test_ignores_wrong_source(self):
        on_fire = AsyncMock()
        bus = _make_event_bus()
        listener = ChangeEventTriggerProvider(bus).build(_TRIGGER, on_fire)
        await listener._handle("other-dev", "temperature", 30, _NOW)
        on_fire.assert_not_called()

    async def test_ignores_wrong_event_type(self):
        on_fire = AsyncMock()
        bus = _make_event_bus()
        listener = ChangeEventTriggerProvider(bus).build(_TRIGGER, on_fire)
        await listener._handle("dev-01", "humidity", 30, _NOW)
        on_fire.assert_not_called()

    async def test_condition_met_fires(self):
        trigger = ChangeEventTrigger(
            source_id="dev-01",
            event_type="temperature",
            condition=Condition(operator=ConditionOperator.GT, threshold=25),
        )
        on_fire = AsyncMock()
        bus = _make_event_bus()
        listener = ChangeEventTriggerProvider(bus).build(trigger, on_fire)
        await listener._handle("dev-01", "temperature", 30, _NOW)
        on_fire.assert_called_once()

    async def test_condition_not_met_does_not_fire(self):
        trigger = ChangeEventTrigger(
            source_id="dev-01",
            event_type="temperature",
            condition=Condition(operator=ConditionOperator.GT, threshold=25),
        )
        on_fire = AsyncMock()
        bus = _make_event_bus()
        listener = ChangeEventTriggerProvider(bus).build(trigger, on_fire)
        await listener._handle("dev-01", "temperature", 20, _NOW)
        on_fire.assert_not_called()

    async def test_falls_back_to_now_when_timestamp_is_none(self):
        on_fire = AsyncMock()
        bus = _make_event_bus()
        listener = ChangeEventTriggerProvider(bus).build(_TRIGGER, on_fire)
        await listener._handle("dev-01", "temperature", 30, None)
        on_fire.assert_called_once()
        ctx: TriggerContext = on_fire.call_args[0][0]
        assert ctx.timestamp is not None


class TestScheduleListener:
    pytestmark = pytest.mark.asyncio

    async def test_stop_before_start_is_safe(self):
        listener = ScheduleListener(ScheduleTrigger(cron="* * * * *"), AsyncMock())
        await listener.stop()  # must not raise

    async def test_start_creates_task_and_stop_cancels_it(self):
        listener = ScheduleListener(ScheduleTrigger(cron="* * * * *"), AsyncMock())
        await listener.start()
        assert listener._task is not None
        await listener.stop()
        assert listener._task is None


class TestCompositeTriggerListenerFactory:
    def _make_factory(
        self,
    ) -> tuple[CompositeTriggerListenerFactory, MagicMock, MagicMock]:
        change_provider = MagicMock()
        schedule_provider = MagicMock()
        factory = CompositeTriggerListenerFactory(change_provider, schedule_provider)
        return factory, change_provider, schedule_provider

    def test_dispatches_change_event_trigger(self):
        factory, change_provider, _ = self._make_factory()
        trigger = ChangeEventTrigger(source_id="d", event_type="temp")
        on_fire = AsyncMock()
        factory.build(trigger, on_fire)
        change_provider.build.assert_called_once_with(trigger, on_fire)

    def test_dispatches_schedule_trigger(self):
        factory, _, schedule_provider = self._make_factory()
        trigger = ScheduleTrigger(cron="0 11 * * *")
        on_fire = AsyncMock()
        factory.build(trigger, on_fire)
        schedule_provider.build.assert_called_once_with(trigger, on_fire)
