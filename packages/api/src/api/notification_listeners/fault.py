from api.notification_listeners import RecipientsGetter
from devices_manager import Attribute, CoreDevice, FaultAttribute
from models.resource_reference import ResourceReference
from models.types import Severity
from notifications.interface import NotificationsServiceInterface


def on_fault_transition(
    notifications: NotificationsServiceInterface,
    recipients: RecipientsGetter,
):
    """Listener: dispatch notifications on fault healthy↔faulty transitions."""

    async def listener(
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

        user_ids = await recipients()
        device_link = (
            f"[{device.name}]({ResourceReference('device', device.id).serialize()})"
        )

        if attribute.is_faulty:
            await notifications.dispatch(
                title=f"New fault on {device.name} ({attribute_name})",
                body=f"Device {device_link} has a new active fault on attribute **{attribute_name}** (value: {attribute.current_value}).",
                severity=attribute.severity,
                user_ids=user_ids,
            )
        else:
            await notifications.dispatch(
                title=f"Fault resolved on {device.name} ({attribute_name})",
                body=f"The fault on attribute **{attribute_name}** of device {device_link} has been resolved (value: {attribute.current_value}).",
                severity=Severity.INFO,
                user_ids=user_ids,
            )

    return listener
