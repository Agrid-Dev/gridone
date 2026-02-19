from devices_manager import DevicesManager
from fastapi import Request
from timeseries import TimeSeriesService


def get_device_manager(request: Request) -> DevicesManager:
    return request.app.state.device_manager


def get_ts_service(request: Request) -> TimeSeriesService:
    return request.app.state.ts_service
