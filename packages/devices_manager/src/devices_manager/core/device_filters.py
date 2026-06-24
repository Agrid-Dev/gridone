from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from .fuzzy_search import fuzzy_match

if TYPE_CHECKING:
    from collections.abc import Collection, Mapping

    from devices_manager.types import DataType

    from .device import CoreDevice


@dataclass(frozen=True)
class DeviceFilters:
    ids: Collection[str] | None = None
    types: Collection[str] | None = None
    writable_attribute: str | None = None
    writable_attribute_type: DataType | None = None
    tags: Mapping[str, Collection[str]] | None = None
    is_faulty: bool | None = None
    search: str | None = None
    driver_id: str | None = None
    transport_id: str | None = None

    def matches(self, device: CoreDevice) -> bool:
        return (
            self._matches_ids(device)
            and self._matches_types(device)
            and self._matches_writable_attribute(device)
            and self._matches_tags(device)
            and self._matches_is_faulty(device)
            and self._matches_search(device)
            and self._matches_driver_id(device)
            and self._matches_transport_id(device)
        )

    def _matches_ids(self, device: CoreDevice) -> bool:
        return self.ids is None or device.id in self.ids

    def _matches_types(self, device: CoreDevice) -> bool:
        return self.types is None or device.type in self.types

    def _matches_writable_attribute(self, device: CoreDevice) -> bool:
        return self.writable_attribute is None or device.can_write(
            self.writable_attribute, data_type=self.writable_attribute_type
        )

    def _matches_tags(self, device: CoreDevice) -> bool:
        return self.tags is None or all(
            device.tags.get(key) in values for key, values in self.tags.items()
        )

    def _matches_is_faulty(self, device: CoreDevice) -> bool:
        return self.is_faulty is None or device.is_faulty == self.is_faulty

    def _matches_search(self, device: CoreDevice) -> bool:
        return self.search is None or fuzzy_match(self.search, device.name)

    def _matches_driver_id(self, device: CoreDevice) -> bool:
        # Virtual devices have driver_id None and never match a driver filter.
        return self.driver_id is None or device.driver_id == self.driver_id

    def _matches_transport_id(self, device: CoreDevice) -> bool:
        # Virtual devices have transport_id None and never match a transport filter.
        return self.transport_id is None or device.transport_id == self.transport_id
