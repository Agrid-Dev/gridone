from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, MagicMock

import pytest

from api.trigger_providers.change_event import (
    ChangeEventTriggerProvider,
    Condition,
    ConditionOperator,
)

if TYPE_CHECKING:
    from automations.models import TriggerContext

_NOW = datetime(2024, 1, 1, tzinfo=UTC)


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
    await captured(_make_device(device_id), attr_name, None, attr)


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
    def test_has_params_schema(self, mock_dm):
        provider = ChangeEventTriggerProvider(mock_dm)
        assert "device_id" in provider.params_schema["properties"]
        assert "attribute" in provider.params_schema["properties"]


class TestChangeEventTriggerProvider:
    pytestmark = pytest.mark.asyncio

    async def test_register_returns_handle_id(self, mock_dm):
        provider = ChangeEventTriggerProvider(mock_dm)
        handle_id = await provider.register(
            {"device_id": "dev-01", "attribute": "temperature"}, AsyncMock()
        )
        assert isinstance(handle_id, str)
        assert len(handle_id) > 0

    async def test_register_subscribes_to_dm(self, mock_dm):
        provider = ChangeEventTriggerProvider(mock_dm)
        await provider.register(
            {"device_id": "dev-01", "attribute": "temperature"}, AsyncMock()
        )
        mock_dm.add_device_attribute_listener.assert_called_once()

    async def test_unregister_removes_dm_listener(self, mock_dm):
        provider = ChangeEventTriggerProvider(mock_dm)
        handle_id = await provider.register(
            {"device_id": "dev-01", "attribute": "temperature"}, AsyncMock()
        )
        await provider.unregister(handle_id)
        mock_dm.remove_device_attribute_listener.assert_called_once()

    async def test_unregister_unknown_handle_is_safe(self, mock_dm):
        provider = ChangeEventTriggerProvider(mock_dm)
        await provider.unregister("nonexistent")  # must not raise

    async def test_fires_on_matching_device_and_attribute(self, mock_dm):
        on_fire = AsyncMock()
        provider = ChangeEventTriggerProvider(mock_dm)
        await provider.register(
            {"device_id": "dev-01", "attribute": "temperature"}, on_fire
        )
        await _fire(mock_dm, "dev-01", "temperature", _make_attr(30))
        on_fire.assert_called_once()
        ctx: TriggerContext = on_fire.call_args[0][0]
        assert ctx.timestamp == _NOW

    async def test_ignores_wrong_device(self, mock_dm):
        on_fire = AsyncMock()
        provider = ChangeEventTriggerProvider(mock_dm)
        await provider.register(
            {"device_id": "dev-01", "attribute": "temperature"}, on_fire
        )
        await _fire(mock_dm, "other", "temperature", _make_attr(30))
        on_fire.assert_not_called()

    async def test_ignores_wrong_attribute(self, mock_dm):
        on_fire = AsyncMock()
        provider = ChangeEventTriggerProvider(mock_dm)
        await provider.register(
            {"device_id": "dev-01", "attribute": "temperature"}, on_fire
        )
        await _fire(mock_dm, "dev-01", "humidity", _make_attr(30))
        on_fire.assert_not_called()

    async def test_condition_met_fires(self, mock_dm):
        on_fire = AsyncMock()
        provider = ChangeEventTriggerProvider(mock_dm)
        await provider.register(
            {
                "device_id": "dev-01",
                "attribute": "temperature",
                "condition": {"operator": "gt", "threshold": 25},
            },
            on_fire,
        )
        await _fire(mock_dm, "dev-01", "temperature", _make_attr(30))
        on_fire.assert_called_once()

    async def test_condition_not_met_does_not_fire(self, mock_dm):
        on_fire = AsyncMock()
        provider = ChangeEventTriggerProvider(mock_dm)
        await provider.register(
            {
                "device_id": "dev-01",
                "attribute": "temperature",
                "condition": {"operator": "gt", "threshold": 25},
            },
            on_fire,
        )
        await _fire(mock_dm, "dev-01", "temperature", _make_attr(20))
        on_fire.assert_not_called()

    async def test_falls_back_to_now_when_last_updated_is_none(self, mock_dm):
        on_fire = AsyncMock()
        provider = ChangeEventTriggerProvider(mock_dm)
        await provider.register(
            {"device_id": "dev-01", "attribute": "temperature"}, on_fire
        )
        await _fire(mock_dm, "dev-01", "temperature", _make_attr(30, last_updated=None))
        on_fire.assert_called_once()
        ctx: TriggerContext = on_fire.call_args[0][0]
        assert ctx.timestamp is not None
