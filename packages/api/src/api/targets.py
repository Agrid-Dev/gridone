"""Target resolution at the composition layer.

Implements :class:`models.targets.TargetResolver`. Resolution lives here —
not in devices_manager — because it is composite by nature: the persisted
:class:`~models.targets.DevicesFilter` is translated into a device query at
this boundary, and the attribute constraint is applied on top of the device
set rather than persisted inside it.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from models.targets import (
    AttributeCoverage,
    AttributeTarget,
    DevicesFilter,
    ResolvedTarget,
    unify_data_types,
)

if TYPE_CHECKING:
    from devices_manager import DevicesServiceInterface
    from devices_manager.dto.device_dto import Device


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
        devices = self._dm.list_devices(**target.devices.model_dump(exclude_none=True))
        exposing = [
            d for d in devices if _exposes(d, target.attribute, writable=writable)
        ]
        exposing_ids = {d.id for d in exposing}
        data_type = unify_data_types(
            d.attributes[target.attribute].data_type for d in exposing
        )
        return ResolvedTarget(
            attribute=target.attribute,
            device_ids=[d.id for d in exposing],
            data_type=data_type,
            excluded_device_ids=[d.id for d in devices if d.id not in exposing_ids],
        )

    async def list_attribute_coverage(
        self, devices: DevicesFilter
    ) -> list[AttributeCoverage]:
        matched = self._dm.list_devices(**devices.model_dump(exclude_none=True))
        return compute_attribute_coverage(matched)
