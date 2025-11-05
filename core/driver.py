from dataclasses import dataclass

from .device_schema import DeviceSchema
from .transports import TransportClient


@dataclass
class Driver:
    transport: TransportClient
    schema: DeviceSchema
