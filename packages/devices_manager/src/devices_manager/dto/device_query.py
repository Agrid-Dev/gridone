"""What a caller asks a device listing with.

``DevicesQuery`` is the read vocabulary of the service; the core
``DeviceFilters`` is what the registry matches on. One converts to the
other here, at the boundary, so neither side carries the other's shape.
"""

from __future__ import annotations

from devices_manager.core.device_filters import DeviceFilters
from models.targets import DevicesFilter
from models.types import DataType  # noqa: TC001 -- pydantic validates this at runtime


class DevicesQuery(DevicesFilter):
    """Criteria selecting the devices of one read.

    Extends the persisted ``DevicesFilter`` with the runtime criteria a
    listing accepts: an attribute the devices must expose, a fault state, a
    name search, a transport. It is a request, never a document: do not
    persist a query, the persisted shape stays ``DevicesFilter``.
    """

    attribute: str | None = None
    writable_attribute: str | None = None
    writable_attribute_type: DataType | None = None
    is_faulty: bool | None = None
    search: str | None = None
    transport_id: str | None = None

    @classmethod
    def from_filter(cls, devices: DevicesFilter) -> DevicesQuery:
        """The query that selects exactly what a persisted filter selects."""
        return cls.model_validate(devices.model_dump())


def dto_to_core(query: DevicesQuery | None) -> DeviceFilters:
    """The registry's matcher for *query*; everything when there is none."""
    if query is None:
        return DeviceFilters()
    return DeviceFilters(**query.model_dump())


__all__ = ["DevicesQuery", "dto_to_core"]
