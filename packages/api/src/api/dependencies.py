from core.devices_manager import DevicesManager
from fastapi import Request
from storage import CoreFileStorage


def get_device_manager(request: Request) -> DevicesManager:
    return request.app.state.device_manager


def get_repository(request: Request) -> CoreFileStorage:
    return request.app.state.repository
