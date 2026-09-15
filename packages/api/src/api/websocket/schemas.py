from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, Field

from devices_manager.dto import Device
from devices_manager.types import AttributeValueType
from models.command_rules import AttributeWriteState, WriteReason


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
    # Attribute timestamps so clients reflect freshness without re-fetching.
    # A device_update is emitted on value change, so last_changed advances too.
    last_updated: datetime | None = None
    last_changed: datetime | None = None


class AttributeResolution(BaseModel):
    raw_value: AttributeValueType | None = None
    resolution_error: WriteReason | None = None


class DeviceWriteStateMessage(WebSocketMessage):
    type: Literal["device_write_state"] = "device_write_state"
    device_id: str
    revision: int
    presentation_state: dict[str, bool] = Field(default_factory=dict)
    attributes: dict[str, AttributeWriteState]
    resolutions: dict[str, AttributeResolution] = Field(default_factory=dict)


class DeviceFullUpdateMessage(WebSocketMessage):
    type: Literal["device_full_update"] = "device_full_update"
    device: Device


class DeviceListUpdateMessage(WebSocketMessage):
    type: Literal["device_list_update"] = "device_list_update"
    devices: list[Device]


class ErrorMessage(WebSocketMessage):
    type: Literal["error"] = "error"
    message: str


WebSocketEvent = (
    DeviceUpdateMessage
    | DeviceWriteStateMessage
    | DeviceFullUpdateMessage
    | DeviceListUpdateMessage
    | PingMessage
    | PongMessage
    | ErrorMessage
)
