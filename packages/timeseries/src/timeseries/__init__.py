import logging

from models.errors import InvalidError, NotFoundError

from timeseries.domain import DataPoint, DataType, SeriesKey
from timeseries.service import TimeSeriesService
from timeseries.storage import build_storage

logger = logging.getLogger(__name__)


async def create_service(db_url: str | None = None) -> TimeSeriesService:
    storage = await build_storage(db_url)
    logger.info(
        "Starting time series service with storage %s", storage.__class__.__name__
    )
    return TimeSeriesService(storage)


__all__ = [
    "DataPoint",
    "DataType",
    "InvalidError",
    "NotFoundError",
    "SeriesKey",
    "TimeSeriesService",
    "create_service",
]
