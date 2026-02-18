from datetime import datetime

from pydantic import BaseModel
from timeseries.domain import DataPointValue, DataType


class TimeSeriesResponse(BaseModel):
    id: str
    data_type: DataType
    owner_id: str
    metric: str
    created_at: datetime
    updated_at: datetime


class DataPointResponse(BaseModel):
    timestamp: datetime
    value: DataPointValue
