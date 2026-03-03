from datetime import datetime

from pydantic import BaseModel


class CommandsQueryFilters(BaseModel):
    device_id: str | None = None
    attribute: str | None = None
    user_id: str | None = None
    start: datetime | None = None
    end: datetime | None = None
