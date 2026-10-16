"""The devices one read matched, served in the public shape on demand.

Building a public ``Device`` is what a listing costs, so the listing
defers it: counts and facets read device headers, a page converts its
slice and nothing else, and a full iteration converts once.
"""

from __future__ import annotations

from enum import StrEnum
from functools import cached_property
from typing import TYPE_CHECKING, Protocol

from pydantic import BaseModel

from devices_manager.core.device.connection_status_attribute import (
    CONNECTION_STATUS_ATTR,
)
from devices_manager.core.standard_schemas.registry import OTHER_TYPE, type_bucket
from devices_manager.types import ConnectionStatus
from models.pagination import Page

if TYPE_CHECKING:
    from collections.abc import Callable, Iterable, Iterator, Mapping, Sequence

    from models.pagination import PaginationParams
    from models.types import AttributeValueType

    from .device_dto import Device


class ListedAttribute(Protocol):
    @property
    def current_value(self) -> AttributeValueType | None: ...


class ListedDevice(Protocol):
    """The header a listing reads without converting the device.

    Both the core device and the public one satisfy it, so a listing can be
    built over either.
    """

    @property
    def id(self) -> str: ...
    @property
    def name(self) -> str: ...
    @property
    def type(self) -> str | None: ...
    @property
    def is_faulty(self) -> bool: ...
    @property
    def attributes(self) -> Mapping[str, ListedAttribute]: ...


class DeviceSortKey(StrEnum):
    NAME = "name"
    TYPE = "type"


class DeviceHealth(StrEnum):
    HEALTHY = "healthy"
    FAULTY = "faulty"


class DeviceFacets(BaseModel):
    """Device counts per filter value, over everything a listing matched.

    ``type`` only carries the buckets present; ``health`` and
    ``connection_status`` carry every value, zero included. A device without
    a connection status attribute counts in no connection bucket.
    """

    type: dict[str, int]
    health: dict[DeviceHealth, int]
    connection_status: dict[ConnectionStatus, int]


def _name_key(device: ListedDevice) -> tuple[str, str]:
    return (device.name.casefold(), device.id)


def _type_key(device: ListedDevice) -> tuple[bool, str, str, str]:
    bucket = type_bucket(device.type)
    return (bucket == OTHER_TYPE, bucket, *_name_key(device))


def _sorted[S: ListedDevice](devices: Iterable[S], sort_by: DeviceSortKey) -> list[S]:
    """Order a device set so that paging it is stable.

    ``name``: case-insensitive name, then id. ``type``: type bucket A→Z with
    ``other`` last, then the name order. The id tie-break makes every order
    total, so two devices never swap pages between requests.
    """
    ordered = list(devices)
    ordered.sort(key=_type_key if sort_by is DeviceSortKey.TYPE else _name_key)
    return ordered


def _connection_status(device: ListedDevice) -> ConnectionStatus | None:
    attribute = device.attributes.get(CONNECTION_STATUS_ATTR)
    if attribute is None or attribute.current_value is None:
        return None
    try:
        return ConnectionStatus(attribute.current_value)
    except ValueError:
        return None


def _count_facets(devices: Iterable[ListedDevice]) -> DeviceFacets:
    facets = DeviceFacets(
        type={},
        health=dict.fromkeys(DeviceHealth, 0),
        connection_status=dict.fromkeys(ConnectionStatus, 0),
    )
    for device in devices:
        bucket = type_bucket(device.type)
        facets.type[bucket] = facets.type.get(bucket, 0) + 1
        health = DeviceHealth.FAULTY if device.is_faulty else DeviceHealth.HEALTHY
        facets.health[health] += 1
        status = _connection_status(device)
        if status is not None:
            facets.connection_status[status] += 1
    return facets


def _slice[S](items: Sequence[S], pagination: PaginationParams | None) -> Page[S]:
    """The requested page of an ordered set; all of it when unpaged."""
    total = len(items)
    if pagination is None:
        return Page(items=list(items), total=total, page=1, size=max(total, 1))
    start = pagination.offset
    return Page(
        items=list(items[start : start + pagination.limit]),
        total=total,
        page=pagination.page,
        size=pagination.size,
    )


class DeviceListing[S: ListedDevice]:
    """The devices one read matched, converted to the public shape when read.

    Membership is fixed when the listing is built; the devices themselves are
    the live objects, read when a page or an iteration converts them. Consume
    a listing in the tick that built it: do not await between the call and
    the read, and do not keep one around.

    ``total`` and ``facets`` only read device headers. ``page`` converts its
    slice and nothing else. A full iteration converts every device once, in
    registry order, and keeps the result, so iterating twice converts once.
    """

    def __init__(self, devices: Iterable[S], convert: Callable[[S], Device]) -> None:
        self._devices = list(devices)
        self._convert = convert

    @property
    def total(self) -> int:
        return len(self._devices)

    def __len__(self) -> int:
        return len(self._devices)

    @cached_property
    def facets(self) -> DeviceFacets:
        return _count_facets(self._devices)

    def page(
        self,
        sort_by: DeviceSortKey = DeviceSortKey.NAME,
        pagination: PaginationParams | None = None,
    ) -> Page[Device]:
        page = _slice(_sorted(self._devices, sort_by), pagination)
        return Page(
            items=[self._convert(device) for device in page.items],
            total=page.total,
            page=page.page,
            size=page.size,
        )

    @cached_property
    def _converted(self) -> list[Device]:
        return [self._convert(device) for device in self._devices]

    def __iter__(self) -> Iterator[Device]:
        return iter(self._converted)


__all__ = [
    "DeviceFacets",
    "DeviceHealth",
    "DeviceListing",
    "DeviceSortKey",
    "ListedDevice",
]
