import logging
from collections.abc import Iterable
from dataclasses import dataclass

from pydantic import TypeAdapter

from devices_manager.core.standard_schemas import validate_standard_schema
from devices_manager.types import TransportProtocols
from models.errors import InvalidError

from .attribute_driver import AttributeDriver
from .device_config_field import DeviceConfigField
from .discovery_listener import DiscoveryListener
from .driver_metadata import DriverMetadata
from .update_strategy import UpdateStrategy

_attribute_driver_spec_adapter: TypeAdapter[AttributeDriver] = TypeAdapter(
    AttributeDriver
)

logger = logging.getLogger(__name__)


def validate_polling_groups(
    update_strategy: UpdateStrategy, attributes: Iterable[AttributeDriver]
) -> None:
    """Reject attributes referencing a polling_group not declared in
    update_strategy.polling_groups."""
    for attribute in attributes:
        if (
            attribute.polling_group is not None
            and attribute.polling_group not in update_strategy.polling_groups
        ):
            msg = (
                f"Attribute '{attribute.name}' references undeclared polling_group "
                f"'{attribute.polling_group}'"
            )
            raise InvalidError(msg)


@dataclass
class Driver:
    metadata: DriverMetadata
    transport: TransportProtocols
    env: dict
    device_config_required: list[DeviceConfigField]
    update_strategy: UpdateStrategy
    attributes: dict[str, AttributeDriver]
    discovery_schema: dict | None = None
    type: str | None = None
    image_src: str | None = None

    def __post_init__(self) -> None:
        validate_polling_groups(self.update_strategy, self.attributes.values())
        if self.type is not None:
            validate_standard_schema(self.type, list(self.attributes.values()))

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
                a["name"]: _attribute_driver_spec_adapter.validate_python(a)
                for a in data["attributes"]
            },
        )
