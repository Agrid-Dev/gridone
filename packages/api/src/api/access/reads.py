"""The device reads a route serves through the caller's policy.

A route that returns device data takes this instead of the devices service
(``get_device_reads``); a route that mutates, or serves transports and
drivers, keeps the service. What the caller cannot read does not exist for
them: hidden is a 404, never a 403.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from models.errors import NotFoundError

if TYPE_CHECKING:
    from api.access.policy import AccessPolicy
    from devices_manager import DevicesServiceInterface
    from devices_manager.dto import FaultView
    from devices_manager.dto.device_dto import Device
    from models.types import DataType, Severity


def _still_matches(device: Device, query: dict[str, Any]) -> bool:
    """Re-check the attribute filters the service matched on the full device."""
    attributes = device.attributes
    attribute: str | None = query.get("attribute")
    writable: str | None = query.get("writable_attribute")
    writable_type: DataType | None = query.get("writable_attribute_type")
    if attribute is not None and attribute not in attributes:
        return False
    if writable is not None and writable not in attributes:
        return False
    return writable_type is None or any(
        "write" in a.read_write_modes and a.data_type == writable_type
        for a in attributes.values()
    )


class ScopedDeviceReads:
    """Device reads projected through one policy; a plain delegate when unrestricted."""

    def __init__(self, dm: DevicesServiceInterface, policy: AccessPolicy) -> None:
        self._dm = dm
        self._policy = policy

    @property
    def is_unrestricted(self) -> bool:
        return self._policy.is_unrestricted

    def list_devices(self, **query: Any) -> list[Device]:  # noqa: ANN401
        devices = self._dm.list_devices(**query)
        if self._policy.is_unrestricted:
            return devices
        projected = (self._policy.project_device(d) for d in devices)
        return [d for d in projected if d is not None and _still_matches(d, query)]

    def get_device(self, device_id: str) -> Device:
        device = self._policy.project_device(self._dm.get_device(device_id))
        if device is None:
            msg = f"Device {device_id} not found"
            raise NotFoundError(msg)
        return device

    def require_attribute(self, device_id: str, attribute: str) -> Device:
        """The device, once the attribute is readable by the caller.

        Unrestricted callers only need the device to exist: the operation's
        own lookup decides what an unknown attribute means (history of an
        attribute a driver no longer declares stays reachable, for one).
        """
        device = self.get_device(device_id)
        if not self._policy.is_unrestricted and attribute not in device.attributes:
            msg = f"Attribute '{attribute}' not found on device '{device_id}'"
            raise NotFoundError(msg)
        return device

    def list_faults(
        self, *, severity: Severity | None = None, device_id: str | None = None
    ) -> list[FaultView]:
        faults = self._dm.list_active_faults(severity=severity, device_id=device_id)
        if self._policy.is_unrestricted:
            return faults
        visible = {d.id: d.attributes for d in self.list_devices()}
        return [
            f
            for f in faults
            if f.device_id in visible and f.attribute_name in visible[f.device_id]
        ]


__all__ = ["ScopedDeviceReads"]
