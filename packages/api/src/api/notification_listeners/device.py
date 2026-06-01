from collections.abc import Awaitable, Callable

from api.notification_listeners import RecipientsGetter
from devices_manager import CoreDevice
from models.resource_reference import ResourceReference
from models.types import Severity
from notifications.interface import NotificationsServiceInterface


def on_device_discovered(
    notifications: NotificationsServiceInterface,
    recipients: RecipientsGetter,
) -> Callable[[CoreDevice], Awaitable[None]]:
    """Listener: dispatch a notification when a new device is registered."""

    async def listener(device: CoreDevice) -> None:
        device_link = (
            f"[{device.name}]({ResourceReference('device', device.id).serialize()})"
        )
        body = (
            f"A new device {device_link} was recognised by a driver"
            " and successfully registered."
        )
        await notifications.dispatch(
            title="New device discovered",
            body=body,
            severity=Severity.INFO,
            user_ids=await recipients(),
            correlation_id=device.id,
        )

    return listener
