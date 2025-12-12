from typing import Annotated

from pydantic import AliasChoices, BaseModel, BeforeValidator, Field, PositiveInt

from .parse_duration import parse_duration

DEFAULT_POLLING_INTERVAL = 10
DEFAULT_READ_TIMEOUT = 10
MAX_TIMEOUT = 60


class UpdateStrategy(BaseModel):
    polling_enabled: bool = True
    polling_interval: Annotated[
        PositiveInt,
        BeforeValidator(lambda v: parse_duration(v) if isinstance(v, str) else v),
    ] = Field(
        default=DEFAULT_POLLING_INTERVAL,
        description=(
            f"Polling interval in seconds. Default {DEFAULT_POLLING_INTERVAL}s"
        ),
        validation_alias=AliasChoices("polling_interval", "polling"),
    )

    read_timeout: Annotated[
        PositiveInt | None,
        BeforeValidator(lambda v: parse_duration(v) if isinstance(v, str) else v),
    ] = Field(
        default=DEFAULT_READ_TIMEOUT,
        description="Read timeout in seconds.",
        validation_alias=AliasChoices("read_timeout", "timeout"),
        le=MAX_TIMEOUT,
    )
