from datetime import datetime

from pydantic import BaseModel

from models.attribute_metadata import LocalizedText
from models.types import AttributeValueType, DataType, Severity


class FaultEpisodeResponse(BaseModel):
    """A period during which a fault attribute stayed outside its healthy values."""

    device_id: str
    device_name: str
    device_type: str | None = None
    attribute_name: str
    data_type: DataType
    severity: Severity
    label: LocalizedText | None = None
    #: The value the attribute took when the episode opened, such as a fault code.
    value: AttributeValueType
    started_at: datetime
    #: None while the episode is still ongoing.
    ended_at: datetime | None = None


class FaultEpisodesResponse(BaseModel):
    episodes: list[FaultEpisodeResponse]
    #: The period read, ``last`` resolved: what durations within it add up to.
    start: datetime
    end: datetime
    #: Observation time shared by all series and ongoing durations.
    as_of: datetime
    #: The read budget was exhausted; only verified episodes are included.
    truncated: bool
