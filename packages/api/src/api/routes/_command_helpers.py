"""Shared helpers for command-dispatch routes."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from api.devices_filter import to_list_devices_kwargs
from models.errors import InvalidError

if TYPE_CHECKING:
    from devices_manager import DevicesServiceInterface
    from models.types import DataType


def resolve_attribute_data_type(
    dm: DevicesServiceInterface,
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


def resolve_attribute_data_type_for_target(
    dm: DevicesServiceInterface,
    target: dict[str, Any],
    attribute: str,
) -> DataType:
    """Resolve ``DataType`` by intersecting *target* with a writable *attribute*.

    Queries DM with every field of the target plus
    ``writable_attribute=attribute``. Raises :class:`InvalidError` if no device
    matches. A ``writable_attribute`` key inside *target* is ignored — the
    attribute being dispatched is the authoritative one for data-type
    resolution.
    """
    kwargs = to_list_devices_kwargs(
        {k: v for k, v in target.items() if k != "writable_attribute"}
    )
    matching = dm.list_devices(writable_attribute=attribute, **kwargs)
    if not matching:
        msg = (
            f"No device matching the target exposes '{attribute}' "
            "as a writable attribute"
        )
        raise InvalidError(msg)
    return matching[0].attributes[attribute].data_type
