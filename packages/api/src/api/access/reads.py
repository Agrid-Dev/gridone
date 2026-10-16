"""The device reads a route serves through the caller's policy.

A route that returns device data takes this instead of the devices service
(``get_device_reads``); a route that mutates, or serves transports and
drivers, keeps the service. What the caller cannot read does not exist for
them: hidden is a 404, never a 403.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from devices_manager.dto import DeviceListing
from models.errors import NotFoundError

if TYPE_CHECKING:
    from collections.abc import Callable, Iterable

    from api.access.policy import AccessPolicy
    from devices_manager import DevicesServiceInterface
    from devices_manager.dto import (
        AttributeSelection,
        Device,
        DevicesQuery,
        DriverLabels,
        FaultView,
    )
    from models.types import Severity


def _still_matches(device: Device, query: DevicesQuery | None) -> bool:
    """Re-check the attribute filters the service matched on the full device."""
    if query is None:
        return True
    attributes = device.attributes
    if query.attribute is not None and query.attribute not in attributes:
        return False
    if (
        query.writable_attribute is not None
        and query.writable_attribute not in attributes
    ):
        return False
    return query.writable_attribute_type is None or any(
        "write" in a.read_write_modes and a.data_type == query.writable_attribute_type
        for a in attributes.values()
    )


def _as_is(device: Device) -> Device:
    return device


class ScopedDeviceReads:
    """Device reads projected through one policy; a plain delegate when unrestricted."""

    def __init__(self, dm: DevicesServiceInterface, policy: AccessPolicy) -> None:
        self._dm = dm
        self._policy = policy

    @property
    def is_unrestricted(self) -> bool:
        return self._policy.is_unrestricted

    def list_devices(
        self,
        query: DevicesQuery | None = None,
        *,
        attribute_selection: AttributeSelection | None = None,
    ) -> DeviceListing:
        """The devices the caller may read among those matching *query*.

        A scoped caller's listing is built over the projected devices, so
        its pages, counts and facets only ever see what the caller may read.
        That projection converts every match first: scoped reads pay the
        whole listing, unrestricted ones pay what they page.
        """
        if self._policy.is_unrestricted:
            return self._dm.list_devices(query, attribute_selection=attribute_selection)
        # Visibility and the attribute filters judge the whole device, so a
        # selection only trims what is left to return.
        projected = (
            self._policy.project_device(d) for d in self._dm.list_devices(query)
        )
        visible = [d for d in projected if d is not None and _still_matches(d, query)]
        convert = (
            _as_is if attribute_selection is None else attribute_selection.restrict
        )
        return DeviceListing(visible, convert=convert)

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

    def get_driver_labels(self, driver_id: str) -> DriverLabels:
        """A driver's labels are not sensitive: every caller reads them whole."""
        return self._dm.get_driver_labels(driver_id)

    def list_faults(
        self, *, severity: Severity | None = None, device_id: str | None = None
    ) -> list[FaultView]:
        faults = self._dm.list_active_faults(severity=severity, device_id=device_id)
        return self.filter_readable(
            faults,
            device_id=lambda f: f.device_id,
            attribute=lambda f: f.attribute_name,
        )

    def filter_readable[T](
        self,
        items: Iterable[T],
        *,
        device_id: Callable[[T], str],
        attribute: Callable[[T], str],
    ) -> list[T]:
        """Keep the rows about a device attribute the caller can read.

        For rows the devices service did not produce (faults, command
        history) and so were never projected.
        """
        if self._policy.is_unrestricted:
            return list(items)
        visible = {d.id: d.attributes for d in self.list_devices()}
        return [
            item
            for item in items
            if device_id(item) in visible
            and attribute(item) in visible[device_id(item)]
        ]


__all__ = ["ScopedDeviceReads"]
