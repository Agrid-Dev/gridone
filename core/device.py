from .attribute import Attribute
from .driver import Driver

type DeviceConfig = dict[str, str]


class Device:
    id: str
    config: DeviceConfig
    driver: Driver
    attributes: dict[str, Attribute]
