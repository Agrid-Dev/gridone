from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest

from api.listeners.timeseries import historise_attribute_update
from devices_manager import Attribute
from devices_manager.types import DataType
from timeseries import TimeSeriesService
from timeseries.domain import SeriesKey

pytestmark = pytest.mark.asyncio

_NOW = datetime(2026, 1, 1, tzinfo=UTC)


def _make_device(device_id: str = "dev-1") -> MagicMock:
    device = MagicMock()
    device.id = device_id
    return device


def _make_attribute(value: float = 21.0) -> Attribute:
    return Attribute(
        name="temperature",
        data_type=DataType.FLOAT,
        read_write_modes={"read"},
        current_value=value,
        last_updated=_NOW,
        last_changed=_NOW,
    )


class TestHistoriseAttributeUpdate:
    async def test_upserts_point_with_attribute_value(self):
        ts_service = AsyncMock(spec=TimeSeriesService)
        listener = historise_attribute_update(ts_service)

        device = _make_device("dev-1")
        await listener(device, "temperature", None, _make_attribute(21.0))

        ts_service.upsert_points.assert_awaited_once()
        key, points = ts_service.upsert_points.call_args.args
        assert key == SeriesKey(owner_id="dev-1", metric="temperature")
        assert points[0].value == 21.0
