from datetime import datetime

from pydantic import BaseModel

from devices_manager.types import AttributeValueType
from models.attribute_metadata import LocalizedText
from models.types import DataType, Severity


class FaultView(BaseModel):
    device_id: str
    device_name: str
    attribute_name: str
    data_type: DataType
    severity: Severity
    current_value: AttributeValueType
    last_updated: datetime
    last_changed: datetime
    #: The driver's wording of the attribute, when it declares one, so a
    #: fault list can name a fault the way the device page does.
    label: LocalizedText | None = None
