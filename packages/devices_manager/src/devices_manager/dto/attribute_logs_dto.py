from pydantic import BaseModel

from devices_manager.core.device.event_log import AttributeEventLog


class AttributeLogs(BaseModel):
    read: list[AttributeEventLog]
    write: list[AttributeEventLog]
    listen: list[AttributeEventLog]
