from __future__ import annotations

from typing import TYPE_CHECKING, Protocol

from timeseries.domain import SortOrder

if TYPE_CHECKING:
    from datetime import datetime

    from timeseries.domain import (
        AttributeValueType,
        DataPoint,
        DeviceCommand,
        DeviceCommandCreate,
        SeriesKey,
        TimeSeries,
    )
    from timeseries.domain.filters import CommandsQueryFilters


class TimeSeriesStorage(Protocol):
    async def create_series(self, series: TimeSeries) -> TimeSeries: ...

    async def get_series(self, series_id: str) -> TimeSeries | None: ...

    async def get_series_by_key(self, key: SeriesKey) -> TimeSeries | None: ...

    async def list_series(
        self,
        *,
        owner_id: str | None = None,
        metric: str | None = None,
    ) -> list[TimeSeries]: ...

    async def fetch_points(
        self,
        key: SeriesKey,
        *,
        start: datetime | None = None,
        end: datetime | None = None,
    ) -> list[DataPoint[AttributeValueType]]: ...

    async def fetch_point_before(
        self,
        key: SeriesKey,
        *,
        before: datetime,
    ) -> DataPoint[AttributeValueType] | None: ...

    async def upsert_points(
        self,
        key: SeriesKey,
        points: list[DataPoint[AttributeValueType]],
    ) -> None: ...

    async def save_command(self, command: DeviceCommandCreate) -> DeviceCommand: ...

    async def query_commands(
        self,
        filters: CommandsQueryFilters,
        *,
        sort: SortOrder = SortOrder.ASC,
        limit: int | None = None,
        offset: int | None = None,
    ) -> list[DeviceCommand]: ...

    async def query_commands_by_ids(self, ids: list[int]) -> list[DeviceCommand]: ...

    async def count_commands(
        self,
        filters: CommandsQueryFilters,
    ) -> int: ...

    async def close(self) -> None: ...
