from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, Field

from api.schemas.device import DeviceBase
from core.types import AttributeValueType


class WebSocketMessage(BaseModel):
    type: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))


class PingMessage(WebSocketMessage):
    type: Literal["ping"] = "ping"


class PongMessage(WebSocketMessage):
    type: Literal["pong"] = "pong"


class DeviceUpdateMessage(WebSocketMessage):
    type: Literal["device_update"] = "device_update"
    device_id: str
    attribute: str
    value: AttributeValueType | None


class DeviceFullUpdateMessage(WebSocketMessage):
    type: Literal["device_full_update"] = "device_full_update"
    device: DeviceBase


class DeviceListUpdateMessage(WebSocketMessage):
    type: Literal["device_list_update"] = "device_list_update"
    devices: list[DeviceBase]


class ErrorMessage(WebSocketMessage):
    type: Literal["error"] = "error"
    message: str


WebSocketEvent = (
    DeviceUpdateMessage
    | DeviceFullUpdateMessage
    | DeviceListUpdateMessage
    | PingMessage
    | PongMessage
    | ErrorMessage
)
