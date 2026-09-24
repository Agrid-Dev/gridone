"""The read policy compiled from a role document (ADR 0004 §2).

Scopes only narrow. A role whose ``devices:read`` carries no scope reads
everything its permissions allow, exactly as before scopes existed; whether
the permission is held at all is ``require_permission``'s business.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from users.permissions import Permission

if TYPE_CHECKING:
    from devices_manager.dto.device_dto import Device
    from models.write_rules import AttributeWriteState
    from users.roles import DeviceScope, DeviceSelector, Role


def _selects(selector: DeviceSelector, type_: str | None, driver_id: str) -> bool:
    """Intersection of the selector's set fields; an unset field matches all."""
    return (selector.types is None or type_ in selector.types) and (
        selector.driver_ids is None or driver_id in selector.driver_ids
    )


class AccessPolicy:
    """What the caller may read, compiled once per request or connection."""

    def __init__(self, read_scopes: list[DeviceScope] | None) -> None:
        # None: ``devices:read`` is unscoped, every device and attribute.
        self._read_scopes = read_scopes

    @classmethod
    def from_role(cls, role: Role | None) -> AccessPolicy:
        """A role that no longer exists grants nothing to ``require_permission``,
        so it never reaches a read: unrestricted is the safe, cheap answer."""
        if role is None:
            return UNRESTRICTED
        scopes = role.scopes.get(Permission.DEVICES_READ)
        return UNRESTRICTED if scopes is None else cls(scopes)

    @property
    def is_unrestricted(self) -> bool:
        return self._read_scopes is None

    def can_read(self, *, type: str | None, driver_id: str, attribute: str) -> bool:  # noqa: A002
        """Union across scopes: one matching scope is enough."""
        if self._read_scopes is None:
            return True
        return any(
            _selects(scope.devices, type, driver_id)
            and (scope.attributes is None or attribute in scope.attributes)
            for scope in self._read_scopes
        )

    def project_device(self, device: Device) -> Device | None:
        """The device with its readable attributes only; None when there are none."""
        if self._read_scopes is None:
            return device
        readable = {
            name: attribute
            for name, attribute in device.attributes.items()
            if self.can_read(
                type=device.type, driver_id=device.driver_id, attribute=name
            )
        }
        if not readable:
            return None
        readable_names = set(readable)
        readable = {
            name: attribute.model_copy(
                update={
                    "write_state": self.project_write_state(
                        attribute.write_state, readable_names
                    )
                }
            )
            for name, attribute in readable.items()
        }
        return device.model_copy(update={"attributes": readable})

    @staticmethod
    def project_write_state(
        state: AttributeWriteState | None, readable: set[str]
    ) -> AttributeWriteState | None:
        """Preserve eligibility while hiding names the caller cannot read."""
        if state is None:
            return None
        return state.model_copy(
            update={
                "missing_attributes": [
                    name for name in state.missing_attributes if name in readable
                ]
            }
        )


UNRESTRICTED = AccessPolicy(None)

__all__ = ["UNRESTRICTED", "AccessPolicy"]
