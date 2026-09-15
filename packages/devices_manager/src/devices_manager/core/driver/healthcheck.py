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
    max_attribute_loss: float = Field(
        default=0.0,
        ge=0.0,
        lt=1.0,
        description=(
            "Highest share of failed outcomes an attribute may show in its recent"
            " read or listen log before the device is reported degraded. Total"
            " loss is never tolerated."
        ),
    )
