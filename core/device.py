from dataclasses import dataclass

from core.types import DeviceConfig

from .attribute import Attribute
from .driver import Driver


@dataclass
class Device:
    id: str
    config: DeviceConfig
    driver: Driver
    attributes: dict[str, Attribute]

    @classmethod
    def from_driver(cls, driver: Driver, config: DeviceConfig) -> "Device":
        # TODO build ids
        return cls(
            id="my-device",
            driver=driver,
            config=config,
            attributes={},
        )
