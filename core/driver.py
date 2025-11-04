from .device_schema import DeviceSchema
from .transports import TransportClient


class Driver:
    transport: TransportClient
    schema: DeviceSchema
