from api.listeners import AttributeListener
from api.websocket.manager import WebSocketManager
from api.websocket.schemas import DeviceFullUpdateMessage, DeviceUpdateMessage
from devices_manager import Attribute, CoreDevice
from devices_manager.dto import device_to_public
from devices_manager.interface import DeviceListener


def broadcast_device_update(websocket_manager: WebSocketManager) -> DeviceListener:
    """Publish the replacement contract and presentation reference together."""

    async def listener(device: CoreDevice) -> None:
        await websocket_manager.broadcast(
            DeviceFullUpdateMessage(device=device_to_public(device))
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
    ) -> None:
        message = DeviceUpdateMessage(
            device_id=device.id,
            attribute=attribute_name,
            value=attribute.current_value,
            last_updated=attribute.last_updated,
            last_changed=attribute.last_changed,
        )
        await websocket_manager.broadcast(message)

    return listener
