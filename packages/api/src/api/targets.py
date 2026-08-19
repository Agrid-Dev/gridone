"""Target resolution at the composition layer.

Implements :class:`models.targets.TargetResolver`. Resolution lives here —
not in devices_manager — because it is composite by nature: the persisted
:class:`~models.targets.DevicesFilter` is translated into a device query at
this boundary, and the attribute constraint is applied on top of the device
set rather than persisted inside it.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from models.errors import InvalidError
from models.targets import (
    AttributeCoverage,
    AttributeTarget,
    DevicesFilter,
    ResolvedTarget,
    unify_data_types,
)

if TYPE_CHECKING:
    from collections.abc import Iterable

    from devices_manager import DevicesServiceInterface
    from devices_manager.dto.device_dto import Device
    from models.targets import TargetResolver


def compute_attribute_coverage(devices: list[Device]) -> list[AttributeCoverage]:
    """Report every attribute exposed across *devices*, with coverage counts."""
    by_name: dict[str, list[Device]] = {}
    for device in devices:
        for name in device.attributes:
            by_name.setdefault(name, []).append(device)
    return [
        AttributeCoverage(
            attribute=name,
            data_types=sorted({d.attributes[name].data_type for d in exposing}),
            device_count=len(exposing),
            writable_count=sum(
                1 for d in exposing if "write" in d.attributes[name].read_write_modes
            ),
        )
        for name, exposing in sorted(by_name.items())
    ]


def _exposes(device: Device, attribute: str, *, writable: bool) -> bool:
    attr = device.attributes.get(attribute)
    if attr is None:
        return False
    return not writable or "write" in attr.read_write_modes


UNTAGGED_GROUP_LABEL = "__untagged__"
"""Sentinel group for devices without the tag. Not a display string — the UI
translates it; a real tag value equal to this sentinel would collide."""


def group_devices_by_tag(
    devices: list[Device], tag_key: str
) -> dict[str, list[Device]]:
    """Bucket *devices* by their value for *tag_key*.

    Devices without the tag land in :data:`UNTAGGED_GROUP_LABEL` instead of
    being dropped.
    """
    groups: dict[str, list[Device]] = {}
    for device in devices:
        label = device.tags.get(tag_key, UNTAGGED_GROUP_LABEL)
        groups.setdefault(label, []).append(device)
    return groups


def group_device_ids_by_tag(
    devices: list[Device], tag_key: str
) -> dict[str, list[str]]:
    """Like :func:`group_devices_by_tag`, keeping just each device's id."""
    return {
        label: [d.id for d in group]
        for label, group in group_devices_by_tag(devices, tag_key).items()
    }


class CompositeTargetResolver:
    """Resolve targets against the devices manager."""

    def __init__(self, dm: DevicesServiceInterface) -> None:
        self._dm = dm

    async def resolve(
        self, target: AttributeTarget, *, writable: bool = False
    ) -> ResolvedTarget:
        """Resolve *target* in a single device query.

        Devices matching the filter but not exposing the attribute (or not
        exposing it as writable when ``writable=True``) are reported in
        ``excluded_device_ids``, never dropped silently. Raises
        :class:`~models.errors.InvalidError` when no device exposes the
        attribute or when the exposed data types are mixed.
        """
        resolved, _ = await self.resolve_with_devices(target, writable=writable)
        return resolved

    async def resolve_with_devices(
        self, target: AttributeTarget, *, writable: bool = False
    ) -> tuple[ResolvedTarget, list[Device]]:
        """Resolve *target* like :meth:`resolve`, also returning the exposing
        devices — for a caller that needs device data beyond the id (e.g.
        current attribute values), sparing it a second ``list_devices`` scan.
        """
        devices = self._dm.list_devices(**target.devices.model_dump(exclude_none=True))
        exposing = [
            d for d in devices if _exposes(d, target.attribute, writable=writable)
        ]
        if not exposing:
            qualifier = " as writable" if writable else ""
            msg = f"No device in the target exposes '{target.attribute}'{qualifier}"
            raise InvalidError(msg)
        exposing_ids = {d.id for d in exposing}
        data_type = unify_data_types(
            d.attributes[target.attribute].data_type for d in exposing
        )
        resolved = ResolvedTarget(
            attribute=target.attribute,
            device_ids=[d.id for d in exposing],
            data_type=data_type,
            excluded_device_ids=[d.id for d in devices if d.id not in exposing_ids],
        )
        return resolved, exposing

    async def list_attribute_coverage(
        self, devices: DevicesFilter
    ) -> list[AttributeCoverage]:
        matched = self._dm.list_devices(**devices.model_dump(exclude_none=True))
        return compute_attribute_coverage(matched)


async def validate_targets(
    resolver: TargetResolver,
    targets: Iterable[AttributeTarget],
    *,
    writable: bool = False,
) -> list[ResolvedTarget]:
    """Resolve every target, surfacing authoring mistakes as ``InvalidError``.

    The shared save-time gate for anything persisting targets (command
    templates, dashboard widgets): zero coverage and mixed data types raise
    :class:`~models.errors.InvalidError` (→ 422); partial coverage is
    allowed and reported on the returned :class:`ResolvedTarget`s.
    """
    return [await resolver.resolve(t, writable=writable) for t in targets]
