import logging

from core.device import Device
from core.devices_manager import DevicesManager

from .device_dto import DeviceDTO
from .device_dto import dto_to_base as device_dto_to_base
from .driver_dto import DriverDTO
from .driver_dto import dto_to_core as driver_dto_to_core
from .transport_dto import TransportDTO
from .transport_dto import dto_to_core as transport_dto_to_core

logger = logging.getLogger(__name__)


def init_devices_manager(
    devices: list[DeviceDTO], drivers: list[DriverDTO], transports: list[TransportDTO]
) -> DevicesManager:
    dm = DevicesManager(
        devices={},
        drivers={},
        transports={},
    )
    for t in transports:
        try:
            dm.transports[t.id] = transport_dto_to_core(t)
        except Exception:
            logger.exception("Failed to init transport %s", t.id)
    for d in drivers:
        try:
            dm.drivers[d.id] = driver_dto_to_core(d)
        except Exception:
            logger.exception("Failed to init driver %s", d.id)
    for d in devices:
        try:
            driver = dm.drivers[d.driver_id]
        except KeyError:
            logger.exception(
                "Cannot create device %s: missing driver %", d.id, d.driver_id
            )
            continue
        try:
            transport = dm.transports[d.transport_id]
        except KeyError:
            logger.exception(
                "Cannot create device %s: missing transport %", d.id, d.transport_id
            )
            continue
        logger.info("Adding device %s", d.id)
        try:
            base = device_dto_to_base(d)
            device = Device.from_base(base, transport=transport, driver=driver)
            dm.add_device(device)
        except Exception:
            logger.exception("Failed to init device %s", d.id)
    return dm
