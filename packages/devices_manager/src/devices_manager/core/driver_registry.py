from __future__ import annotations

import logging
import re
from copy import deepcopy
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from pydantic import TypeAdapter, ValidationError

from devices_manager.core.device.attribute import AttributeKind
from devices_manager.core.device.connection_status import CONNECTION_STATUS_ATTR
from devices_manager.core.driver import AnyAttributeDriver
from devices_manager.core.driver.driver import (
    attributes_referencing,
    validate_polling_groups,
    validate_push_only_polling,
    validate_write_constraints,
)
from devices_manager.core.driver.driver_metadata import DriverMetadata
from devices_manager.core.presentation import (
    PresentationEnvelope,
    PresentationStatus,
    UnavailablePresentation,
    check_compatibility,
    rename_attribute,
    validate_presentation,
)
from devices_manager.core.presentation.package_install import InvalidPresentationError
from devices_manager.core.standard_schemas import validate_standard_schema
from models.errors import ConflictError, InvalidError, NotFoundError

if TYPE_CHECKING:
    from collections.abc import Callable

    from devices_manager.core.driver import DriverStorage
    from devices_manager.core.driver.attribute_driver import AttributeDriver
    from devices_manager.core.presentation import PresentationDiagnostic
    from devices_manager.core.transports import TransportClient

    from .driver import Driver

logger = logging.getLogger(__name__)

_attr_adapter: TypeAdapter[AttributeDriver] = TypeAdapter(AnyAttributeDriver)

# Fields that merge field-wise into the existing model instead of replacing it.
_MERGED_MODEL_FIELDS = {"update_strategy", "healthcheck"}


def _reject_reserved_attribute_name(name: str) -> None:
    if name == CONNECTION_STATUS_ATTR:
        msg = f'"{CONNECTION_STATUS_ATTR}" is a reserved attribute name'
        raise InvalidError(msg)


_SNAKE_CASE_PATTERN = re.compile(r"^[a-z][a-z0-9]*(_[a-z0-9]+)*$")


def _reject_non_snake_case_name(name: str) -> None:
    """Reject attribute names that aren't snake_case."""
    if not _SNAKE_CASE_PATTERN.fullmatch(name):
        msg = f"Attribute name {name!r} must be snake_case"
        raise InvalidError(msg)


def _reject_dangling_references(
    driver_id: str, attribute_id: str, remaining: list[AttributeDriver]
) -> None:
    """Deleting an attribute another one bounds itself on would leave a
    reference the service could never resolve at write time."""
    referencing = attributes_referencing(remaining, attribute_id)
    if referencing:
        names = ", ".join(attribute.name for attribute in referencing)
        msg = (
            f"Attribute {attribute_id} of driver {driver_id} is a write_constraints "
            f"bound of {names}. Update or remove those constraints before deleting it."
        )
        raise ConflictError(msg)


def _follow_rename(
    attribute: AttributeDriver, old_name: str, new_name: str
) -> AttributeDriver:
    """Copy of ``attribute`` whose write-constraint bounds on ``old_name``
    now name ``new_name``; the attribute itself when it has no such bound."""
    constraints = attribute.write_constraints
    if constraints is None or not constraints.references(old_name):
        return attribute
    return attribute.model_copy(
        update={
            "write_constraints": constraints.with_reference_renamed(old_name, new_name)
        }
    )


def _summarize(diagnostics: list[PresentationDiagnostic]) -> str:
    return "; ".join(
        f"[{diagnostic.code}] {diagnostic.path}: {diagnostic.message}"
        for diagnostic in diagnostics
    )


def _reject_invalid_presentation(
    envelope: PresentationEnvelope,
    attributes: dict[str, AttributeDriver],
) -> None:
    """Refuse to import a supported-version document that does not validate.

    ADR §6: an incorrect v1 document is refused with field errors, while a
    version or capability this server does not know is kept inert and
    reported at read time — refusing it would make a driver written for a
    newer server unusable on an older one.
    """
    if check_compatibility(envelope):
        return
    status = validate_presentation(envelope, attributes)
    if isinstance(status, UnavailablePresentation):
        raise InvalidPresentationError(status.diagnostics)


def _log_if_presentation_unavailable(driver: Driver) -> None:
    """An attribute change may leave the presentation unavailable.

    That is a visible fallback at read time, never a reason to refuse the
    change (ADR §6): the driver keeps its transport, the page falls back.
    """
    if driver.presentation is None:
        return
    status = validate_presentation(driver.presentation, driver.attributes)
    if isinstance(status, UnavailablePresentation):
        logger.warning(
            "Presentation of driver %s is unavailable after an attribute change: %s",
            driver.id,
            _summarize(status.diagnostics),
        )


class DriverRegistry:
    """In-memory registry for drivers with optional persistence."""

    _drivers: dict[str, Driver]
    _storage: DriverStorage | None

    def __init__(
        self,
        drivers: dict[str, Driver] | None = None,
        *,
        storage: DriverStorage | None = None,
    ) -> None:
        self._drivers = drivers if drivers is not None else {}
        self._storage = storage

    @property
    def all(self) -> dict[str, Driver]:
        return self._drivers

    @property
    def ids(self) -> set[str]:
        return set(self._drivers.keys())

    def list_all(self, *, device_type: str | None = None) -> list[Driver]:
        drivers = self._drivers.values()
        if device_type is not None:
            return [d for d in drivers if d.type == device_type]
        return list(drivers)

    def _get_or_raise(self, driver_id: str) -> Driver:
        try:
            return self._drivers[driver_id]
        except KeyError as e:
            msg = f"Driver {driver_id} not found"
            raise NotFoundError(msg) from e

    def get(self, driver_id: str) -> Driver:
        return self._get_or_raise(driver_id)

    def presentation_status(self, driver_id: str) -> PresentationStatus | None:
        """The driver's presentation resolved against its current attributes;
        ``None`` when the driver declares none."""
        driver = self._get_or_raise(driver_id)
        if driver.presentation is None:
            return None
        return validate_presentation(driver.presentation, driver.attributes)

    @staticmethod
    def _get_attribute_or_raise(
        driver: Driver, driver_id: str, attribute_id: str
    ) -> AttributeDriver:
        try:
            return driver.attributes[attribute_id]
        except KeyError as e:
            msg = f"Attribute {attribute_id} not found in driver {driver_id}"
            raise NotFoundError(msg) from e

    @staticmethod
    def _assert_standard_schema_allows(
        driver: Driver,
        candidate_attrs: list[AttributeDriver],
        build_message: Callable[[InvalidError], str],
        *,
        type_override: str | None = None,
    ) -> None:
        effective_type = type_override if type_override is not None else driver.type
        if effective_type is None:
            return
        try:
            validate_standard_schema(effective_type, candidate_attrs)
        except InvalidError as e:
            raise ConflictError(build_message(e)) from e

    @staticmethod
    def _touch(driver: Driver) -> None:
        driver.metadata.updated_at = datetime.now(UTC)

    async def _persist(self, driver: Driver) -> None:
        """Bump updated_at and write back. The single chokepoint every
        mutating method funnels through, so a new one can't forget to
        bump the timestamp."""
        self._touch(driver)
        if self._storage is not None:
            await self._storage.write(driver.id, driver)

    async def add(self, driver: Driver) -> Driver:
        if driver.id in self._drivers:
            msg = f"Driver {driver.id} already exists"
            raise ConflictError(msg)
        for name in driver.attributes:
            _reject_reserved_attribute_name(name)
        if driver.presentation is not None:
            _reject_invalid_presentation(driver.presentation, driver.attributes)
        if self._storage is not None:
            await self._storage.write(driver.id, driver)
        self._drivers[driver.id] = driver
        return driver

    async def install(self, candidate: Driver, expected: Driver | None) -> Driver:
        """Persist a validated complete candidate before publishing its live pointer."""
        for name in candidate.attributes:
            _reject_reserved_attribute_name(name)
        if candidate.presentation is not None:
            _reject_invalid_presentation(candidate.presentation, candidate.attributes)
        self._touch(candidate)
        if expected is not None:
            candidate.metadata.created_at = expected.metadata.created_at
        if self._storage is not None:
            await self._storage.compare_and_swap(candidate, expected)
        self._drivers[candidate.id] = candidate
        return candidate

    async def patch(self, driver_id: str, updates: dict[str, Any]) -> Driver:
        """Apply resolved root-level field updates to the driver.

        ``updates`` maps field name to its new value — only fields the
        caller explicitly set (patch semantics live at the wire layer;
        this is a dumb merge + validate). Nested models
        (``update_strategy``, ``healthcheck``) merge field-wise from a
        partial dict.
        """
        current = self._get_or_raise(driver_id)
        driver = deepcopy(current)
        if updates.get("type") is not None:
            self._assert_standard_schema_allows(
                driver,
                list(driver.attributes.values()),
                lambda e: f"Cannot set driver type to '{updates['type']}': {e}",
                type_override=updates["type"],
            )
        resolved = dict(updates)
        for field in _MERGED_MODEL_FIELDS & resolved.keys():
            resolved[field] = getattr(driver, field).model_copy(update=resolved[field])
        if "presentation" in resolved:
            resolved["presentation"] = self._accepted_presentation(
                driver, resolved["presentation"]
            )
        if (merged_strategy := resolved.get("update_strategy")) is not None:
            validate_polling_groups(merged_strategy, driver.attributes.values())
            validate_push_only_polling(driver.transport, merged_strategy)
        metadata_fields = DriverMetadata.model_fields
        for field, value in resolved.items():
            target = driver.metadata if field in metadata_fields else driver
            setattr(target, field, value)
        await self._persist(driver)
        current.__dict__.update(driver.__dict__)
        return current

    @staticmethod
    def _accepted_presentation(
        driver: Driver, value: object
    ) -> PresentationEnvelope | None:
        """The envelope a patch installs: ``None`` removes it, anything else
        is read as an envelope (the wire layer hands a plain dict) and
        validated as a candidate against the driver's attributes."""
        if value is None:
            return None
        try:
            envelope = PresentationEnvelope.model_validate(value)
        except ValidationError:
            logger.exception("Presentation envelope rejected for driver %s", driver.id)
            msg = "Invalid presentation envelope"
            raise InvalidError(msg) from None
        _reject_invalid_presentation(envelope, driver.attributes)
        return envelope

    async def create_driver_attribute(
        self, driver_id: str, attribute: AttributeDriver
    ) -> AttributeDriver:
        driver = self._get_or_raise(driver_id)
        _reject_reserved_attribute_name(attribute.name)
        _reject_non_snake_case_name(attribute.name)
        if attribute.name in driver.attributes:
            msg = f"Attribute {attribute.name} already exists in driver {driver_id}"
            raise ConflictError(msg)
        candidate_attrs = [*driver.attributes.values(), attribute]
        self._assert_standard_schema_allows(
            driver,
            candidate_attrs,
            lambda e: (
                f'Cannot add "{attribute.name}" to driver {driver_id} which declares '
                f"type {driver.type!r}: {e}"
            ),
        )
        validate_polling_groups(driver.update_strategy, [attribute])
        validate_write_constraints(candidate_attrs)
        driver.attributes[attribute.name] = attribute
        await self._persist(driver)
        return attribute

    async def patch_driver_attribute(
        self, driver_id: str, attribute_id: str, updates: dict[str, Any]
    ) -> AttributeDriver:
        """Merge resolved field updates into an attribute and revalidate it.

        ``updates`` maps field name to its new value — only fields the
        caller explicitly set.
        """
        driver = self._get_or_raise(driver_id)
        existing = self._get_attribute_or_raise(driver, driver_id, attribute_id)
        merged: dict[str, Any] = existing.model_dump() | updates
        if merged.get("kind") != AttributeKind.FAULT:
            fault_only = {"severity", "healthy_values"} & updates.keys()
            if fault_only:
                msg = f"Fields {sorted(fault_only)} are only valid on fault attributes"
                raise InvalidError(msg)
        try:
            updated: AttributeDriver = _attr_adapter.validate_python(merged)
        except ValidationError:
            logger.exception(
                "Attribute validation failed for driver %s attribute %s",
                driver_id,
                attribute_id,
            )
            msg = "Invalid attribute configuration"
            raise InvalidError(msg) from None
        validate_polling_groups(driver.update_strategy, [updated])
        candidate_attrs = [
            updated if aid == attribute_id else a
            for aid, a in driver.attributes.items()
        ]
        validate_write_constraints(candidate_attrs)
        driver.attributes[attribute_id] = updated
        _log_if_presentation_unavailable(driver)
        await self._persist(driver)
        return updated

    async def delete_driver_attribute(
        self, driver_id: str, attribute_id: str
    ) -> Driver:
        driver = self._get_or_raise(driver_id)
        self._get_attribute_or_raise(driver, driver_id, attribute_id)
        remaining = [a for aid, a in driver.attributes.items() if aid != attribute_id]
        self._assert_standard_schema_allows(
            driver,
            remaining,
            lambda e: (  # noqa: ARG005
                f"Driver {driver_id} declares type {driver.type!r} which "
                f"requires {attribute_id}. Unset the driver's type before "
                "deleting this attribute."
            ),
        )
        _reject_dangling_references(driver_id, attribute_id, remaining)
        del driver.attributes[attribute_id]
        _log_if_presentation_unavailable(driver)
        await self._persist(driver)
        return driver

    async def rename_driver_attribute(
        self, driver_id: str, attribute_id: str, new_name: str
    ) -> AttributeDriver:
        driver = self._get_or_raise(driver_id)
        self._get_attribute_or_raise(driver, driver_id, attribute_id)
        _reject_reserved_attribute_name(new_name)
        _reject_non_snake_case_name(new_name)
        if new_name != attribute_id and new_name in driver.attributes:
            msg = f"Attribute {new_name} already exists in driver {driver_id}"
            raise InvalidError(msg)
        renamed = driver.attributes[attribute_id].model_copy(update={"name": new_name})
        # Bounds taken from the renamed attribute follow it structurally.
        followed = {
            a.name: _follow_rename(a, attribute_id, new_name)
            for a in attributes_referencing(driver.attributes.values(), attribute_id)
        }
        remaining = [
            renamed if aid == attribute_id else followed.get(aid, a)
            for aid, a in driver.attributes.items()
        ]
        self._assert_standard_schema_allows(
            driver,
            remaining,
            lambda e: (  # noqa: ARG005
                f'Cannot rename "{attribute_id}" which is required for devices '
                f'of type "{driver.type}". Change or unset the type before '
                "modifying this attribute name."
            ),
        )
        del driver.attributes[attribute_id]
        driver.attributes[new_name] = renamed
        driver.attributes.update(followed)
        if driver.presentation is not None:
            # Bindings on the renamed attribute follow it structurally; an
            # unsupported version is returned untouched.
            driver.presentation = rename_attribute(
                driver.presentation, attribute_id, new_name
            )
        await self._persist(driver)
        return renamed

    async def remove(self, driver_id: str) -> None:
        self._get_or_raise(driver_id)
        del self._drivers[driver_id]
        if self._storage is not None:
            await self._storage.delete(driver_id)

    @staticmethod
    def check_transport_compat(driver: Driver, transport: TransportClient) -> None:
        if driver.transport != transport.protocol:
            msg = f"Transport {transport.id} is not compatible with driver {driver.id}"
            raise ValueError(msg)
