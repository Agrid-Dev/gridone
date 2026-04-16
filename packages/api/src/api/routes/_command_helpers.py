"""Shared helpers for command-dispatch routes."""

from __future__ import annotations

from typing import TYPE_CHECKING

from models.errors import InvalidError

if TYPE_CHECKING:
    from devices_manager import DevicesManagerInterface
    from models.types import DataType


def resolve_attribute_data_type(
    dm: DevicesManagerInterface,
    device_ids: list[str],
    attribute: str,
) -> DataType:
    """Resolve the ``DataType`` of a writable attribute across a set of devices.

    Returns the ``data_type`` of *attribute* on the first device in *device_ids*
    that exposes it as writable. Raises :class:`InvalidError` if no candidate
    device exposes the attribute as writable — per project spec, no per-device
    compatibility pre-validation is performed beyond this minimal step needed
    to persist the command's data type.
    """
    matching = dm.list_devices(ids=device_ids, writable_attribute=attribute)
    if not matching:
        msg = f"No device exposes '{attribute}' as a writable attribute"
        raise InvalidError(msg)
    return matching[0].attributes[attribute].data_type
