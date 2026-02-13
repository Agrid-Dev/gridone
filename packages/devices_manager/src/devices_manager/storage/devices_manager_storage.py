from typing import Protocol

from gridone_storage import StorageBackend

from devices_manager.dto.device_dto import DeviceDTO
from devices_manager.dto.driver_dto import DriverDTO
from devices_manager.dto.transport_dto import TransportDTO


class DevicesManagerStorage(Protocol):
    devices: StorageBackend[DeviceDTO]
    drivers: StorageBackend[DriverDTO]
    transports: StorageBackend[TransportDTO]
