from datetime import datetime

from pydantic import BaseModel
from models.types import AttributeValueType, DataType


class TimeSeriesResponse(BaseModel):
    id: str
    data_type: DataType
    owner_id: str
    metric: str
    created_at: datetime
    updated_at: datetime


class DataPointResponse(BaseModel):
    timestamp: datetime
    value: AttributeValueType
