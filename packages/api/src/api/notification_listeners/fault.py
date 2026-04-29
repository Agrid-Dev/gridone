from __future__ import annotations

from typing import TYPE_CHECKING, Protocol

from devices_manager import FaultAttribute
from models.resource_reference import ResourceReference
from models.types import Severity
from users.models import User

if TYPE_CHECKING:
    from devices_manager import Attribute, CoreDevice
    from devices_manager.interface import DevicesManagerInterface
    from notifications.interface import NotificationsServiceInterface


class _UsersProvider(Protocol):
    async def list_users(self) -> list[User]: ...


class FaultNotificationListener:
    """Dispatches notifications on fault attribute healthy↔faulty transitions."""

    def __init__(
        self,
        dm: DevicesManagerInterface,
        um: _UsersProvider,
        notifications: NotificationsServiceInterface,
    ) -> None:
        self._dm = dm
        self._um = um
        self._notifications = notifications
        self._fault_states: dict[tuple[str, str], bool] = {}

    def register(self) -> None:
        self._dm.add_device_attribute_listener(self._on_attribute_update)

    async def _on_attribute_update(
        self,
        device: CoreDevice,
        attribute_name: str,
        attribute: Attribute,
    ) -> None:
        if not isinstance(attribute, FaultAttribute):
            return

        key = (device.id, attribute_name)
        was_faulty = self._fault_states.get(key, False)
        is_now_faulty = attribute.is_faulty

        if is_now_faulty == was_faulty:
            return

        self._fault_states[key] = is_now_faulty

        users = await self._um.list_users()
        user_ids = [u.id for u in users if not u.is_blocked]
        device_link = (
            f"[{device.name}]({ResourceReference('device', device.id).serialize()})"
        )

        if is_now_faulty:
            await self._notifications.dispatch(
                title=f"New fault on {device.name}",
                body=f"Device {device_link} has a new active fault on attribute `{attribute_name}`.",
                severity=attribute.severity,
                user_ids=user_ids,
            )
        else:
            await self._notifications.dispatch(
                title=f"Fault resolved on {device.name}",
                body=f"The fault on attribute `{attribute_name}` of device {device_link} has been resolved.",
                severity=Severity.INFO,
                user_ids=user_ids,
            )
