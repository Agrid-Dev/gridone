from typing import Annotated, Any

import yaml as pyyaml
from pydantic import BaseModel, ConfigDict, Discriminator, Field, Tag, field_validator

from devices_manager.core.device.attribute import AttributeKind
from devices_manager.core.driver import (
    AttributeDriver,
    DeviceConfigField,
    Driver,
    DriverMetadata,
    FaultAttributeDriver,
    UpdateStrategy,
)
from devices_manager.types import TransportProtocols


def _attribute_kind_tag(v: Any) -> str:  # noqa: ANN401
    """Resolve the `kind` tag for discriminated-union dispatch.

    Defaults to `standard` when the field is absent — matches the default
    on AttributeDriver.kind so YAML entries without an explicit `kind:`
    key parse as standard attributes.
    """
    if isinstance(v, dict):
        return v.get("kind", AttributeKind.STANDARD)
    return getattr(v, "kind", AttributeKind.STANDARD)


_AttributeDriverUnion = Annotated[
    Annotated[AttributeDriver, Tag(AttributeKind.STANDARD)]
    | Annotated[FaultAttributeDriver, Tag(AttributeKind.FAULT)],
    Discriminator(_attribute_kind_tag),
]


class DriverSpec(BaseModel):
    id: Annotated[str, Field(min_length=1)]
    vendor: str | None = None
    model: str | None = None
    version: int | None = None
    image_src: str | None = None
    transport: TransportProtocols
    env: Annotated[dict, Field(default_factory=dict)]
    update_strategy: UpdateStrategy = Field(default_factory=UpdateStrategy)
    device_config: list[DeviceConfigField]
    attributes: list[_AttributeDriverUnion]
    discovery: dict | None = None
    type: str | None = None

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
    env: dict | None = None
    update_strategy: UpdateStrategy | None = None

    @field_validator("env", "update_strategy", mode="before")
    @classmethod
    def _not_null(cls, v: Any) -> Any:  # noqa: ANN401
        if v is None:
            msg = "cannot be null"
            raise ValueError(msg)
        return v


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
        device_config=driver.device_config_required,
        discovery=driver.discovery_schema,
        attributes=list(driver.attributes.values()),
        type=driver.type,
    )


def dto_to_core(dto: DriverSpec) -> Driver:
    return Driver(
        metadata=DriverMetadata.model_validate(dto.model_dump()),
        transport=dto.transport,
        env=dto.env,
        device_config_required=dto.device_config,
        update_strategy=dto.update_strategy,
        attributes={a.name: a for a in dto.attributes},
        discovery_schema=dto.discovery,
        type=dto.type,
    )
