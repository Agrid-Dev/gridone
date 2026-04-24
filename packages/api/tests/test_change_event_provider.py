from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from api.trigger_providers.change_event import (
    ChangeEventTriggerProvider,
    Condition,
    ConditionOperator,
)
from automations.models import TriggerContext
from devices_manager.interface import DevicesManagerInterface

_NOW = datetime(2024, 1, 1, tzinfo=UTC)


def _make_dm() -> MagicMock:
    return MagicMock(spec=DevicesManagerInterface)


def _make_device(device_id: str) -> MagicMock:
    device = MagicMock()
    device.id = device_id
    return device


def _make_attr(value: object, last_updated: datetime | None = _NOW) -> MagicMock:
    attr = MagicMock()
    attr.current_value = value
    attr.last_updated = last_updated
    return attr


async def _fire(dm: MagicMock, device_id: str, attr_name: str, attr: object) -> None:
    """Call the callback captured by the DM mock."""
    captured = dm.add_device_attribute_listener.call_args[0][0]
    await captured(_make_device(device_id), attr_name, attr)


class TestConditionEvaluate:
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
            # other AttributeValueType variants
            (ConditionOperator.EQ, True, True, True),
            (ConditionOperator.EQ, True, False, False),
            (ConditionOperator.EQ, "on", "on", True),
            (ConditionOperator.EQ, "on", "off", False),
        ],
    )
    def test_operator(self, op, threshold, value, expected):
        c = Condition(operator=op, threshold=threshold)
        assert c.evaluate(value) is expected

    def test_none_value_returns_false(self):
        c = Condition(operator=ConditionOperator.GT, threshold=10)
        assert c.evaluate(None) is False

    def test_incompatible_types_returns_false(self):
        c = Condition(operator=ConditionOperator.GT, threshold=10)
        assert c.evaluate("not-a-number") is False


class TestChangeEventTriggerProviderConfig:
    def test_has_id_and_trigger_schema(self):
        provider = ChangeEventTriggerProvider(_make_dm())
        assert provider.id == "change_event"
        assert "device_id" in provider.trigger_schema["properties"]
        assert "attribute" in provider.trigger_schema["properties"]


class TestChangeEventTriggerProvider:
    pytestmark = pytest.mark.asyncio

    async def test_register_returns_handle_id(self):
        dm = _make_dm()
        provider = ChangeEventTriggerProvider(dm)
        handle_id = await provider.register(
            {"device_id": "dev-01", "attribute": "temperature"}, AsyncMock()
        )
        assert isinstance(handle_id, str)
        assert len(handle_id) > 0

    async def test_register_subscribes_to_dm(self):
        dm = _make_dm()
        provider = ChangeEventTriggerProvider(dm)
        await provider.register(
            {"device_id": "dev-01", "attribute": "temperature"}, AsyncMock()
        )
        dm.add_device_attribute_listener.assert_called_once()

    async def test_unregister_removes_dm_listener(self):
        dm = _make_dm()
        provider = ChangeEventTriggerProvider(dm)
        handle_id = await provider.register(
            {"device_id": "dev-01", "attribute": "temperature"}, AsyncMock()
        )
        await provider.unregister(handle_id)
        dm.remove_device_attribute_listener.assert_called_once()

    async def test_unregister_unknown_handle_is_safe(self):
        provider = ChangeEventTriggerProvider(_make_dm())
        await provider.unregister("nonexistent")  # must not raise

    async def test_fires_on_matching_device_and_attribute(self):
        dm = _make_dm()
        on_fire = AsyncMock()
        provider = ChangeEventTriggerProvider(dm)
        await provider.register(
            {"device_id": "dev-01", "attribute": "temperature"}, on_fire
        )
        await _fire(dm, "dev-01", "temperature", _make_attr(30))
        on_fire.assert_called_once()
        ctx: TriggerContext = on_fire.call_args[0][0]
        assert ctx.timestamp == _NOW

    async def test_ignores_wrong_device(self):
        dm = _make_dm()
        on_fire = AsyncMock()
        provider = ChangeEventTriggerProvider(dm)
        await provider.register(
            {"device_id": "dev-01", "attribute": "temperature"}, on_fire
        )
        await _fire(dm, "other", "temperature", _make_attr(30))
        on_fire.assert_not_called()

    async def test_ignores_wrong_attribute(self):
        dm = _make_dm()
        on_fire = AsyncMock()
        provider = ChangeEventTriggerProvider(dm)
        await provider.register(
            {"device_id": "dev-01", "attribute": "temperature"}, on_fire
        )
        await _fire(dm, "dev-01", "humidity", _make_attr(30))
        on_fire.assert_not_called()

    async def test_condition_met_fires(self):
        dm = _make_dm()
        on_fire = AsyncMock()
        provider = ChangeEventTriggerProvider(dm)
        await provider.register(
            {
                "device_id": "dev-01",
                "attribute": "temperature",
                "condition": {"operator": "gt", "threshold": 25},
            },
            on_fire,
        )
        await _fire(dm, "dev-01", "temperature", _make_attr(30))
        on_fire.assert_called_once()

    async def test_condition_not_met_does_not_fire(self):
        dm = _make_dm()
        on_fire = AsyncMock()
        provider = ChangeEventTriggerProvider(dm)
        await provider.register(
            {
                "device_id": "dev-01",
                "attribute": "temperature",
                "condition": {"operator": "gt", "threshold": 25},
            },
            on_fire,
        )
        await _fire(dm, "dev-01", "temperature", _make_attr(20))
        on_fire.assert_not_called()

    async def test_falls_back_to_now_when_last_updated_is_none(self):
        dm = _make_dm()
        on_fire = AsyncMock()
        provider = ChangeEventTriggerProvider(dm)
        await provider.register(
            {"device_id": "dev-01", "attribute": "temperature"}, on_fire
        )
        await _fire(dm, "dev-01", "temperature", _make_attr(30, last_updated=None))
        on_fire.assert_called_once()
        ctx: TriggerContext = on_fire.call_args[0][0]
        assert ctx.timestamp is not None
