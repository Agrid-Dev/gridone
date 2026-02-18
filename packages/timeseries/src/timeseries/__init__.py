from timeseries.domain import DataPoint, DataType, SeriesKey
from timeseries.service import TimeSeriesService
from timeseries.storage import build_storage


async def create_service(db_url: str | None = None) -> TimeSeriesService:
    storage = build_storage(db_url)
    return TimeSeriesService(storage)


__all__ = [
    "DataPoint",
    "DataType",
    "SeriesKey",
    "TimeSeriesService",
    "create_service",
]
