from __future__ import annotations

from bisect import bisect_left
from copy import deepcopy
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from models.errors import InvalidError, NotFoundError

from timeseries.domain import DeviceCommand

if TYPE_CHECKING:
    from timeseries.domain import (
        AttributeValueType,
        DataPoint,
        DeviceCommandCreate,
        SeriesKey,
        TimeSeries,
    )
    from timeseries.domain.filters import CommandsQueryFilters


@dataclass
class CommandMemoryStorage:
    _history: list[DeviceCommand] = field(default_factory=list)
    _current_index = 0

    def add(self, command: DeviceCommandCreate) -> DeviceCommand:
        self._current_index += 1
        new_command = DeviceCommand(id=self._current_index, **command.__dict__)
        self._history.append(new_command)
        return new_command

    def query(self, filters: CommandsQueryFilters) -> list[DeviceCommand]:
        results = list(self._history)
        if filters.device_id is not None:
            results = [c for c in results if c.device_id == filters.device_id]
        if filters.attribute is not None:
            results = [c for c in results if c.attribute == filters.attribute]
        if filters.user_id is not None:
            results = [c for c in results if c.user_id == filters.user_id]
        if filters.start is not None:
            results = [c for c in results if c.timestamp >= filters.start]
        if filters.end is not None:
            results = [c for c in results if c.timestamp < filters.end]
        return results


class MemoryStorage:
    def __init__(self) -> None:
        self._series: dict[str, TimeSeries] = {}
        self._key_index: dict[SeriesKey, str] = {}
        self._command_history = CommandMemoryStorage()

    async def create_series(self, series: TimeSeries) -> TimeSeries:
        if series.id in self._series:
            msg = f"Series {series.id} already exists"
            raise InvalidError(msg)
        if series.key in self._key_index:
            msg = f"Series with key {series.key} already exists"
            raise InvalidError(msg)
        stored = deepcopy(series)
        self._series[stored.id] = stored
        self._key_index[stored.key] = stored.id
        return deepcopy(stored)

    async def get_series(self, series_id: str) -> TimeSeries | None:
        series = self._series.get(series_id)
        return deepcopy(series) if series else None

    async def get_series_by_key(self, key: SeriesKey) -> TimeSeries | None:
        series_id = self._key_index.get(key)
        if series_id is None:
            return None
        return await self.get_series(series_id)

    async def list_series(
        self,
        *,
        owner_id: str | None = None,
        metric: str | None = None,
    ) -> list[TimeSeries]:
        results = self._series.values()

        if owner_id is not None:
            results = [s for s in results if s.owner_id == owner_id]
        if metric is not None:
            results = [s for s in results if s.metric == metric]
        return [deepcopy(s) for s in results]

    async def fetch_points(
        self,
        key: SeriesKey,
        *,
        start: datetime | None = None,
        end: datetime | None = None,
    ) -> list[DataPoint[AttributeValueType]]:
        series_id = self._key_index.get(key)
        if series_id is None:
            return []
        points = self._series[series_id].data_points
        if start is not None:
            points = [p for p in points if p.timestamp >= start]
        if end is not None:
            points = [p for p in points if p.timestamp <= end]
        return list(points)

    async def fetch_point_before(
        self,
        key: SeriesKey,
        *,
        before: datetime,
    ) -> DataPoint[AttributeValueType] | None:
        series_id = self._key_index.get(key)
        if series_id is None:
            return None
        points = self._series[series_id].data_points
        timestamps = [p.timestamp for p in points]
        idx = bisect_left(timestamps, before)
        if idx > 0:
            return points[idx - 1]
        return None

    async def upsert_points(
        self,
        key: SeriesKey,
        points: list[DataPoint[AttributeValueType]],
    ) -> None:
        series_id = self._key_index.get(key)
        if series_id is None:
            msg = f"No series found for key {key}"
            raise NotFoundError(msg)
        series = self._series[series_id]
        existing = {p.timestamp: p for p in series.data_points}
        for p in points:
            existing[p.timestamp] = p
        series.data_points = sorted(existing.values(), key=lambda p: p.timestamp)
        series.updated_at = datetime.now(tz=UTC)

    async def save_command(self, command: DeviceCommandCreate) -> DeviceCommand:
        return self._command_history.add(command)

    async def query_commands(
        self, filters: CommandsQueryFilters
    ) -> list[DeviceCommand]:
        return self._command_history.query(filters)
