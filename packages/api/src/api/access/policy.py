"""The access policy compiled from a role document (ADR 0004 §2).

Scopes only narrow. A role whose ``devices:read`` carries no scope reads
everything its permissions allow, exactly as before scopes existed; whether
the permission is held at all is ``require_permission``'s business.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from users.permissions import Permission

if TYPE_CHECKING:
    from devices_manager import Attribute
    from devices_manager.dto.device_dto import Device
    from models.write_rules import AttributeWriteState
    from users.roles import DeviceScope, DeviceSelector, Role


def _selects(selector: DeviceSelector, type_: str | None, driver_id: str) -> bool:
    """Intersection of the selector's set fields; an unset field matches all."""
    return (selector.types is None or type_ in selector.types) and (
        selector.driver_ids is None or driver_id in selector.driver_ids
    )


def _matches(
    scopes: list[DeviceScope], type_: str | None, driver_id: str, attribute: str
) -> bool:
    """Union across scopes: one matching scope is enough."""
    return any(
        _selects(scope.devices, type_, driver_id)
        and (scope.attributes is None or attribute in scope.attributes)
        for scope in scopes
    )


class AccessPolicy:
    """What the caller may read and command, compiled once per request or
    connection."""

    def __init__(
        self,
        read_scopes: list[DeviceScope] | None,
        command_scopes: list[DeviceScope] | None = None,
    ) -> None:
        # None: unscoped, every device and attribute. A command scope of None
        # also stands for "not held": require_permission refuses the command.
        self._read_scopes = read_scopes
        self._command_scopes = command_scopes

    @classmethod
    def from_role(cls, role: Role | None) -> AccessPolicy:
        """A role that no longer exists grants nothing to ``require_permission``,
        so it never reaches a read: unrestricted is the safe, cheap answer.

        Commanding implies reading, so a role commanding through a scope
        without holding ``devices:read`` reads what it commands and nothing
        more.
        """
        if role is None:
            return UNRESTRICTED
        command = role.scopes.get(Permission.DEVICES_COMMAND)
        if Permission.DEVICES_READ in role.permissions:
            read = role.scopes.get(Permission.DEVICES_READ)
        else:
            read = None if command is None else []
        if read is None and command is None:
            return UNRESTRICTED
        return cls(read, command)

    @property
    def is_unrestricted(self) -> bool:
        """Every device is served exactly as the devices service holds it."""
        return self._read_scopes is None and self._command_scopes is None

    @property
    def reads_everything(self) -> bool:
        return self._read_scopes is None

    def can_read(self, *, type: str | None, driver_id: str, attribute: str) -> bool:  # noqa: A002
        if self._read_scopes is None or _matches(
            self._read_scopes, type, driver_id, attribute
        ):
            return True
        return self._command_scopes is not None and _matches(
            self._command_scopes, type, driver_id, attribute
        )

    def can_command(self, *, type: str | None, driver_id: str, attribute: str) -> bool:  # noqa: A002
        """What the caller cannot read, it cannot command either."""
        if self._command_scopes is None:
            return self.can_read(type=type, driver_id=driver_id, attribute=attribute)
        return _matches(self._command_scopes, type, driver_id, attribute)

    def project_device(self, device: Device) -> Device | None:
        """The device with its readable attributes only; None when there are none.

        A readable attribute the caller may not command loses ``write``, as if
        its driver could not write it.
        """
        if self.is_unrestricted:
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
        projected = {
            name: self._project_attribute(device, name, attribute, readable_names)
            for name, attribute in readable.items()
        }
        return device.model_copy(update={"attributes": projected})

    def _project_attribute(
        self, device: Device, name: str, attribute: Attribute, readable: set[str]
    ) -> Attribute:
        if (
            self._command_scopes is not None
            and "write" in attribute.read_write_modes
            and not self.can_command(
                type=device.type, driver_id=device.driver_id, attribute=name
            )
        ):
            return attribute.model_copy(
                update={
                    "read_write_modes": attribute.read_write_modes - {"write"},
                    "write_state": None,
                }
            )
        if attribute.write_state is None or self.reads_everything:
            return attribute  # no name to hide from its write state
        return attribute.model_copy(
            update={
                "write_state": self.project_write_state(attribute.write_state, readable)
            }
        )

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
