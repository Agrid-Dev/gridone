from datetime import datetime

from pydantic import BaseModel

from devices_manager.types import AttributeValueType
from models.types import Severity


class FaultView(BaseModel):
    device_id: str
    device_name: str
    attribute_name: str
    severity: Severity
    current_value: AttributeValueType
    last_updated: datetime
    last_changed: datetime
