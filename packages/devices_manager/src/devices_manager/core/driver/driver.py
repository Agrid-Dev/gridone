import logging
from dataclasses import dataclass

from devices_manager.types import TransportProtocols

from .attribute_driver import AttributeDriver
from .device_config_field import DeviceConfigField
from .discovery_listener import DiscoveryListener
from .driver_metadata import DriverMetadata
from .update_strategy import UpdateStrategy

logger = logging.getLogger(__name__)


@dataclass
class Driver:
    metadata: DriverMetadata
    transport: TransportProtocols
    env: dict
    device_config_required: list[DeviceConfigField]
    update_strategy: UpdateStrategy
    attributes: dict[str, AttributeDriver]
    discovery_schema: dict | None = None

    @property
    def name(self) -> str:
        return self.metadata.name

    @property
    def id(self) -> str:
        return self.metadata.id

    @property
    def discovery_listener(self) -> DiscoveryListener | None:
        if self.discovery_schema:
            return DiscoveryListener.from_dict(self.discovery_schema)
        return None

    @classmethod
    def from_dict(cls, data: dict) -> "Driver":
        """@deprecated
        (instanciation from exchange/storage models to be moved in dto)"""
        env = data.get("env")
        return cls(
            metadata=DriverMetadata(id=data["id"]),
            transport=TransportProtocols(data["transport"]),
            env=env or {},
            device_config_required=[
                DeviceConfigField(**field) for field in data.get("device_config", [])
            ],
            update_strategy=UpdateStrategy.model_validate(
                data.get("update_strategy", {})
            ),
            attributes={
                a["name"]: AttributeDriver.from_dict(a) for a in data["attributes"]
            },
        )
