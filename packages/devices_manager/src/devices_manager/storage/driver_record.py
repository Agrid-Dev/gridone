"""Durable representation of drivers, private to the storage layer.

``DriverRecord`` and its converters never leave ``storage/``: backends
implement the core ``DriverStorage`` port and exchange core ``Driver``
objects with the rest of the package.
"""

from typing import Annotated

from pydantic import Field

from devices_manager.core.driver import (
    AnyAttributeDriver,
    DeviceConfigField,
    Driver,
    DriverMetadata,
    HealthCheck,
    UpdateStrategy,
)
from devices_manager.storage.storage_backend import StorageBackend
from devices_manager.types import TransportProtocols
from models.metadata import ResourceMetadata


class DriverRecord(ResourceMetadata):
    """Durable snapshot of a driver.

    Field names match the historical persisted shape so rows and files
    written before this model stay readable.
    """

    id: Annotated[str, Field(min_length=1)]
    vendor: str | None = None
    model: str | None = None
    version: int | None = None
    image_src: str | None = None
    transport: TransportProtocols
    env: Annotated[dict, Field(default_factory=dict)]
    update_strategy: UpdateStrategy = Field(default_factory=UpdateStrategy)
    healthcheck: HealthCheck = Field(default_factory=HealthCheck)
    device_config: Annotated[list[DeviceConfigField], Field(default_factory=list)]
    attributes: Annotated[list[AnyAttributeDriver], Field(default_factory=list)]
    discovery: dict | None = None
    type: str | None = None


def to_record(driver: Driver) -> DriverRecord:
    return DriverRecord(
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
        attributes=list(driver.attributes.values()),
        discovery=driver.discovery_schema,
        type=driver.type,
        created_at=driver.metadata.created_at,
        updated_at=driver.metadata.updated_at,
    )


def from_record(record: DriverRecord) -> Driver:
    return Driver(
        metadata=DriverMetadata.model_validate(record.model_dump()),
        transport=record.transport,
        env=record.env,
        device_config_required=record.device_config,
        update_strategy=record.update_strategy,
        healthcheck=record.healthcheck,
        attributes={a.name: a for a in record.attributes},
        discovery_schema=record.discovery,
        type=record.type,
    )


class RecordDriverStorage:
    """``DriverStorage`` port over any ``StorageBackend[DriverRecord]``.

    Shared by the memory and yaml backends; postgres implements the port
    directly against its columnar table.
    """

    def __init__(self, records: StorageBackend[DriverRecord]) -> None:
        self._records = records

    async def read(self, item_id: str) -> Driver:
        return from_record(await self._records.read(item_id))

    async def write(self, item_id: str, driver: Driver) -> None:
        await self._records.write(item_id, to_record(driver))

    async def read_all(self) -> list[Driver]:
        return [from_record(record) for record in await self._records.read_all()]

    async def list_all(self) -> list[str]:
        return await self._records.list_all()

    async def delete(self, item_id: str) -> None:
        await self._records.delete(item_id)
