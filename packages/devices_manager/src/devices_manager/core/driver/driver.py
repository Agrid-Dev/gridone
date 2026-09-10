from collections.abc import Iterable
from dataclasses import dataclass, field

from pydantic import TypeAdapter

from devices_manager.core.presentation.envelope import PresentationEnvelope
from devices_manager.core.standard_schemas import validate_standard_schema
from devices_manager.types import DataType, TransportProtocols
from models.errors import InvalidError

from .attribute_driver import AttributeDriver
from .attribute_metadata import AttributeRef
from .device_config_field import DeviceConfigField
from .discovery_listener import DiscoveryListener
from .driver_metadata import DriverMetadata
from .healthcheck import HealthCheck
from .update_strategy import UpdateStrategy

_attribute_driver_spec_adapter: TypeAdapter[AttributeDriver] = TypeAdapter(
    AttributeDriver
)


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


_NUMERIC_DATA_TYPES = frozenset({DataType.INT, DataType.FLOAT})


def attributes_referencing(
    attributes: Iterable[AttributeDriver], attribute_name: str
) -> list[AttributeDriver]:
    """The attributes whose write constraints take a bound from ``attribute_name``."""
    return [
        attribute
        for attribute in attributes
        if attribute.write_constraints is not None
        and attribute.write_constraints.references(attribute_name)
    ]


def validate_write_constraints(attributes: Iterable[AttributeDriver]) -> None:
    """Reject write constraints the service could never enforce.

    Constraints only make sense on numeric (int/float) attributes, and a
    bound given as ``{attribute: name}`` must point at a *different*,
    numeric attribute of the same driver: its current value is read at
    write time, so a string or bool sibling could never serve as a bound.
    """
    by_name = {attribute.name: attribute for attribute in attributes}
    for attribute in by_name.values():
        constraints = attribute.write_constraints
        if constraints is None:
            continue
        if attribute.data_type not in _NUMERIC_DATA_TYPES:
            msg = (
                f"Attribute '{attribute.name}' declares write_constraints but its "
                f"data_type '{attribute.data_type}' is not numeric (int or float)"
            )
            raise InvalidError(msg)
        for bound_name, ref in constraints.bound_refs().items():
            _validate_bound_reference(attribute, bound_name, ref, by_name)


def _validate_bound_reference(
    attribute: AttributeDriver,
    bound_name: str,
    ref: AttributeRef,
    by_name: dict[str, AttributeDriver],
) -> None:
    path = f"Attribute '{attribute.name}' write_constraints.{bound_name}"
    if ref.attribute == attribute.name:
        msg = f"{path} must not reference the attribute itself"
        raise InvalidError(msg)
    target = by_name.get(ref.attribute)
    if target is None:
        msg = f"{path} references unknown attribute '{ref.attribute}'"
        raise InvalidError(msg)
    if target.data_type not in _NUMERIC_DATA_TYPES:
        msg = (
            f"{path} references attribute '{ref.attribute}' whose data_type "
            f"'{target.data_type}' is not numeric (int or float)"
        )
        raise InvalidError(msg)


def validate_push_only_polling(
    transport: TransportProtocols, update_strategy: UpdateStrategy
) -> None:
    """Reject polling on push-only transports.

    A webhook transport cannot solicit data — its reads raise — so polling
    would only pile up READ-error log entries and degrade the connection
    status of a device that is perfectly alimented by pushes. Named polling
    groups poll even when default polling is disabled, so they are rejected
    on the same grounds.
    """
    if transport != TransportProtocols.WEBHOOK:
        return
    if update_strategy.polling_enabled:
        msg = "Webhook drivers are push-only: polling cannot be enabled"
        raise InvalidError(msg)
    if update_strategy.polling_groups:
        msg = "Webhook drivers are push-only: polling groups cannot be declared"
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
    healthcheck: HealthCheck = field(default_factory=HealthCheck)
    # Stored as an opaque envelope and resolved at read time: a document
    # that became incompatible or invalid must never keep a driver — and
    # its devices — from loading (ADR §10). Candidate validation happens in
    # the registry, on import.
    presentation: PresentationEnvelope | None = None
    presentation_revision: str | None = None

    def __post_init__(self) -> None:
        validate_polling_groups(self.update_strategy, self.attributes.values())
        validate_write_constraints(self.attributes.values())
        validate_push_only_polling(self.transport, self.update_strategy)
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
        presentation = data.get("presentation")
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
            healthcheck=HealthCheck.model_validate(data.get("healthcheck", {})),
            attributes={
                a["name"]: _attribute_driver_spec_adapter.validate_python(a)
                for a in data["attributes"]
            },
            presentation=(
                PresentationEnvelope.model_validate(presentation)
                if presentation is not None
                else None
            ),
        )
