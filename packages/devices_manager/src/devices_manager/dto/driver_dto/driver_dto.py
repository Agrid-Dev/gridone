from typing import Annotated, Any, Self

import yaml as pyyaml
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)

from devices_manager.core.device.attribute import AttributeKind
from devices_manager.core.driver import (
    AnyAttributeDriver,
    DeviceConfigField,
    Driver,
    DriverMetadata,
    HealthCheck,
    UpdateStrategy,
)
from devices_manager.core.transports import RawTransportAddress
from devices_manager.types import AttributeValueType, TransportProtocols
from models.metadata import ResourceMetadata
from models.types import Severity

# The wire shape of a driver attribute is the core discriminated union
# itself — attributes are embedded core objects, not a separate projection.
AttributeDriverSpec = AnyAttributeDriver


class DriverSpec(ResourceMetadata):
    id: Annotated[str, Field(min_length=1)]
    vendor: str | None = None
    model: str | None = None
    version: int | None = None
    image_src: str | None = None
    transport: TransportProtocols
    env: Annotated[dict, Field(default_factory=dict)]
    update_strategy: UpdateStrategy = Field(default_factory=UpdateStrategy)
    healthcheck: HealthCheck = Field(default_factory=HealthCheck)
    device_config: list[DeviceConfigField]
    attributes: list[AttributeDriverSpec]
    discovery: dict | None = None
    type: str | None = None

    @model_validator(mode="after")
    def _disable_polling_on_push_only_transport(self) -> Self:
        """Webhook is push-only (reads raise), so polling would only log
        READ errors and degrade a healthy device. An explicit
        ``polling_enabled: true`` is a contradiction and is rejected; a
        driver that simply omits it gets polling disabled instead of the
        polling default.
        """
        if (
            self.transport == TransportProtocols.WEBHOOK
            and self.update_strategy.polling_enabled
        ):
            if "polling_enabled" in self.update_strategy.model_fields_set:
                msg = "Webhook drivers are push-only: polling cannot be enabled"
                raise ValueError(msg)
            self.update_strategy.polling_enabled = False
        return self

    @classmethod
    def from_yaml(cls, yaml: str) -> "DriverSpec":
        data = pyyaml.safe_load(yaml)
        return cls.model_validate(data)


class DriverYaml(BaseModel):
    yaml: str


class DriverPatch(BaseModel):
    """Mutable root-level driver fields; extra fields are rejected."""

    model_config = ConfigDict(extra="forbid")

    vendor: str | None = None
    model: str | None = None
    version: int | None = None
    image_src: str | None = None
    type: str | None = None
    env: dict | None = None
    update_strategy: UpdateStrategy | None = None
    healthcheck: HealthCheck | None = None

    @field_validator("env", "update_strategy", "healthcheck", mode="before")
    @classmethod
    def _not_null(cls, v: Any) -> Any:  # noqa: ANN401
        if v is None:
            msg = "cannot be null"
            raise ValueError(msg)
        return v


class AttributePatch(BaseModel):
    """Mutable attribute fields; name and data_type are immutable and are rejected."""

    model_config = ConfigDict(extra="forbid")

    read: RawTransportAddress | None = None
    write: RawTransportAddress | None = None  # null means read-only
    codecs: list[dict[str, Any]] | None = None
    kind: AttributeKind | None = None
    severity: Severity | None = None
    healthy_values: list[AttributeValueType] | None = None
    polling_group: str | None = None  # null falls back to the default polling_interval

    @field_validator(
        "read", "codecs", "kind", "severity", "healthy_values", mode="before"
    )
    @classmethod
    def _not_null(cls, v: Any) -> Any:  # noqa: ANN401
        if v is None:
            msg = "cannot be null"
            raise ValueError(msg)
        return v


class AttributeRename(BaseModel):
    """Rename a driver attribute."""

    model_config = ConfigDict(extra="forbid")
    new_name: Annotated[str, Field(min_length=1)]


def core_to_dto(driver: Driver) -> DriverSpec:
    return DriverSpec(
        id=driver.metadata.id,
        vendor=driver.metadata.vendor,
        model=driver.metadata.model,
        version=driver.metadata.version,
        image_src=driver.metadata.image_src,
        transport=driver.transport,
        env=driver.env,
        update_strategy=driver.update_strategy,
        healthcheck=driver.healthcheck,
        device_config=driver.device_config_required,
        discovery=driver.discovery_schema,
        attributes=list(driver.attributes.values()),
        type=driver.type,
        created_at=driver.metadata.created_at,
        updated_at=driver.metadata.updated_at,
    )


def dto_to_core(dto: DriverSpec) -> Driver:
    return Driver(
        metadata=DriverMetadata.model_validate(dto.model_dump()),
        transport=dto.transport,
        env=dto.env,
        device_config_required=dto.device_config,
        update_strategy=dto.update_strategy,
        healthcheck=dto.healthcheck,
        attributes={a.name: a for a in dto.attributes},
        discovery_schema=dto.discovery,
        type=dto.type,
    )
