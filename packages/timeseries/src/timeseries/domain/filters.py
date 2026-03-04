from datetime import datetime

from pydantic import BaseModel, model_validator


class CommandsQueryFilters(BaseModel):
    device_id: str | None = None
    attribute: str | None = None
    user_id: str | None = None
    start: datetime | None = None
    end: datetime | None = None

    @model_validator(mode="after")
    def _start_before_end(self) -> "CommandsQueryFilters":
        if self.start is not None and self.end is not None and self.start >= self.end:
            msg = "start must be before end"
            raise ValueError(msg)
        return self
