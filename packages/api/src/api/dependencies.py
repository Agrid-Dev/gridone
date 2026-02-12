from devices_manager import DevicesManager
from fastapi import Request


def get_device_manager(request: Request) -> DevicesManager:
    return request.app.state.device_manager
