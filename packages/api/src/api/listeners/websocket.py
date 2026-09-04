from api.listeners import AttributeListener
from api.websocket.manager import WebSocketManager
from api.websocket.schemas import DeviceUpdateMessage
from devices_manager import Attribute, CoreDevice


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
