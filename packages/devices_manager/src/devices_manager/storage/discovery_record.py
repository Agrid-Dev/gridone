"""Durable representation of discovery registrations, private to the storage
layer."""

from urllib.parse import quote

from pydantic import BaseModel

from devices_manager.core.discovery_manager import DiscoveryConfig
from devices_manager.storage.storage_backend import StorageBackend


class DiscoveryRecord(BaseModel):
    driver_id: str
    transport_id: str


def _item_id(config: DiscoveryConfig) -> str:
    """File-safe storage address of a registration, unique per pair: each id
    is percent-encoded, so the ``+`` joining them never occurs inside one.
    ``("t1", "thermostat_mqtt")`` gives ``t1+thermostat_mqtt``. Reads use the
    record's own fields, never this string."""
    transport_id = quote(config["transport_id"], safe="")
    driver_id = quote(config["driver_id"], safe="")
    return f"{transport_id}+{driver_id}"


class RecordDiscoveryStorage:
    """``DiscoveryStorage`` port over any ``StorageBackend[DiscoveryRecord]``.

    Shared by the memory and yaml backends; postgres implements the port
    directly against its table.
    """

    def __init__(self, records: StorageBackend[DiscoveryRecord]) -> None:
        self._records = records

    async def read_all(self) -> list[DiscoveryConfig]:
        return [
            DiscoveryConfig(
                driver_id=record.driver_id, transport_id=record.transport_id
            )
            for record in await self._records.read_all()
        ]

    async def write(self, config: DiscoveryConfig) -> None:
        await self._records.write(_item_id(config), DiscoveryRecord(**config))

    async def delete(self, config: DiscoveryConfig) -> None:
        await self._records.delete(_item_id(config))
