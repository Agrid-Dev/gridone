from typing import Annotated

from pydantic import BaseModel, BeforeValidator, Field, PositiveInt

from .parse_duration import parse_duration


class HealthCheck(BaseModel):
    expected_push_interval: Annotated[
        PositiveInt | None,
        BeforeValidator(lambda v: parse_duration(v) if isinstance(v, str) else v),
    ] = Field(
        default=None,
        description="Expected emission interval (seconds) for push devices.",
    )
