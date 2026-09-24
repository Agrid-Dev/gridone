"""Device events onto the WebSocket feed, projected per connection.

Each listener builds the message once and hands the manager a projector: the
message a given policy may receive, or ``None``. The listener is the one place
that holds both the event and the device it concerns, so the projection
stays here rather than in the manager or on the wire.
"""

from api.access import AccessPolicy
from api.listeners import AttributeListener
from api.websocket.manager import WebSocketManager
from api.websocket.schemas import (
    AttributeResolution,
    DeviceFullUpdateMessage,
    DeviceUpdateMessage,
    DeviceWriteStateMessage,
)
from devices_manager import Attribute, CoreDevice
from devices_manager.dto import device_to_public
from devices_manager.interface import DeviceListener


def _readable(policy: AccessPolicy, device: CoreDevice, attribute: str) -> bool:
    return policy.can_read(
        type=device.type, driver_id=device.driver_id, attribute=attribute
    )


def broadcast_device_update(websocket_manager: WebSocketManager) -> DeviceListener:
    """Publish the replacement contract and presentation reference together."""

    async def listener(device: CoreDevice) -> None:
        public = device_to_public(device)

        def visible(policy: AccessPolicy) -> DeviceFullUpdateMessage | None:
            projected = policy.project_device(public)
            return (
                None if projected is None else DeviceFullUpdateMessage(device=projected)
            )

        await websocket_manager.broadcast(
            DeviceFullUpdateMessage(device=public), project=visible
        )

    return listener


def broadcast_attribute_update(
    websocket_manager: WebSocketManager,
) -> AttributeListener:
    """Listener: broadcast attribute updates to websocket clients."""

    async def listener(
        device: CoreDevice,
        attribute_name: str,
        _previous: Attribute | None,
        attribute: Attribute,
        *,
        initial: bool,
    ) -> None:
        message = DeviceUpdateMessage(
            device_id=device.id,
            attribute=attribute_name,
            value=attribute.current_value,
            last_updated=attribute.last_updated,
            last_changed=attribute.last_changed,
        )

        def visible(policy: AccessPolicy) -> DeviceUpdateMessage | None:
            return message if _readable(policy, device, attribute_name) else None

        await websocket_manager.broadcast(message, project=visible)

    return listener


def broadcast_write_state(websocket_manager: WebSocketManager) -> DeviceListener:
    async def listener(device: CoreDevice) -> None:
        message = DeviceWriteStateMessage(
            device_id=device.id,
            revision=device.write_state_revision,
            attributes={
                name: attribute.write_state
                for name, attribute in device.attributes.items()
                if attribute.write_state is not None
            },
            resolutions={
                name: AttributeResolution(
                    raw_value=attribute.raw_value,
                    resolution_error=attribute.resolution_error,
                )
                for name, attribute in device.attributes.items()
                if attribute.write_state is not None
            },
        )

        def visible(policy: AccessPolicy) -> DeviceWriteStateMessage | None:
            if policy.is_unrestricted:
                return message
            readable = {n for n in device.attributes if _readable(policy, device, n)}
            if not readable:
                return None  # a device the caller cannot see at all
            return message.model_copy(
                update={
                    "attributes": {
                        n: s for n, s in message.attributes.items() if n in readable
                    },
                    "resolutions": {
                        n: r for n, r in message.resolutions.items() if n in readable
                    },
                }
            )

        await websocket_manager.broadcast(message, project=visible)

    return listener
