from typing import Annotated, Any

from pydantic import (
    AliasChoices,
    BaseModel,
    BeforeValidator,
    Field,
    PositiveInt,
    model_validator,
)

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

    expected_push_interval: Annotated[
        PositiveInt | None,
        BeforeValidator(lambda v: parse_duration(v) if isinstance(v, str) else v),
    ] = Field(
        default=None,
        description=(
            "Deprecated: use the driver's `healthcheck.expected_push_interval` instead."
        ),
        validation_alias=AliasChoices("expected_push_interval", "expected_push"),
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

    polling_groups: Annotated[
        dict[str, PositiveInt],
        BeforeValidator(
            lambda v: (
                {
                    name: (
                        parse_duration(interval)
                        if isinstance(interval, str)
                        else interval
                    )
                    for name, interval in v.items()
                }
                if isinstance(v, dict)
                else v
            )
        ),
    ] = Field(
        default_factory=dict,
        description="Named polling groups: group name -> interval in seconds.",
    )

    @model_validator(mode="before")
    @classmethod
    def handle_disabled_polling(cls, values: dict[str, Any]) -> dict[str, Any]:
        if values.get("polling") == "disable":
            values["polling_interval"] = DEFAULT_POLLING_INTERVAL
            values["polling_enabled"] = False
        return values
