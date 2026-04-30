from devices_manager import Attribute, CoreDevice, FaultAttribute
from devices_manager.interface import DevicesServiceInterface
from models.resource_reference import ResourceReference
from models.types import Severity
from notifications.interface import NotificationsServiceInterface
from users.interface import UsersServiceInterface


class FaultNotificationListener:
    """Dispatches notifications on fault attribute healthy↔faulty transitions."""

    def __init__(
        self,
        dm: DevicesServiceInterface,
        um: UsersServiceInterface,
        notifications: NotificationsServiceInterface,
    ) -> None:
        self._dm = dm
        self._um = um
        self._notifications = notifications

    def register(self) -> None:
        self._dm.add_device_attribute_listener(self._on_attribute_update)

    async def _on_attribute_update(
        self,
        device: CoreDevice,
        attribute_name: str,
        previous: Attribute | None,
        attribute: Attribute,
    ) -> None:
        if not isinstance(attribute, FaultAttribute):
            return

        prev_is_faulty = isinstance(previous, FaultAttribute) and previous.is_faulty
        if attribute.is_faulty == prev_is_faulty:
            return

        users = await self._um.list_users()
        user_ids = [u.id for u in users if not u.is_blocked]
        device_link = (
            f"[{device.name}]({ResourceReference('device', device.id).serialize()})"
        )

        if attribute.is_faulty:
            await self._notifications.dispatch(
                title=f"New fault on {device.name} ({attribute_name})",
                body=f"Device {device_link} has a new active fault on attribute `{attribute_name}`.",
                severity=attribute.severity,
                user_ids=user_ids,
            )
        else:
            await self._notifications.dispatch(
                title=f"Fault resolved on {device.name} ({attribute_name})",
                body=f"The fault on attribute `{attribute_name}` of device {device_link} has been resolved.",
                severity=Severity.INFO,
                user_ids=user_ids,
            )
