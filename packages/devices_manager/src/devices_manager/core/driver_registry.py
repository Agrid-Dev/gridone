from __future__ import annotations

import logging
import re
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from pydantic import TypeAdapter, ValidationError

from devices_manager.core.device.attribute import AttributeKind
from devices_manager.core.device.connection_status import CONNECTION_STATUS_ATTR
from devices_manager.core.driver import AnyAttributeDriver
from devices_manager.core.driver.driver import (
    validate_polling_groups,
    validate_push_only_polling,
)
from devices_manager.core.driver.driver_metadata import DriverMetadata
from devices_manager.core.standard_schemas import validate_standard_schema
from models.errors import ConflictError, InvalidError, NotFoundError

if TYPE_CHECKING:
    from collections.abc import Callable

    from devices_manager.core.driver import DriverStorage
    from devices_manager.core.driver.attribute_driver import AttributeDriver
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
        self._drivers[driver.id] = driver
        if self._storage is not None:
            await self._storage.write(driver.id, driver)
        return driver

    async def patch(self, driver_id: str, updates: dict[str, Any]) -> Driver:
        """Apply resolved root-level field updates to the driver.

        ``updates`` maps field name to its new value — only fields the
        caller explicitly set (patch semantics live at the wire layer;
        this is a dumb merge + validate). Nested models
        (``update_strategy``, ``healthcheck``) merge field-wise from a
        partial dict.
        """
        driver = self._get_or_raise(driver_id)
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
        if (merged_strategy := resolved.get("update_strategy")) is not None:
            validate_polling_groups(merged_strategy, driver.attributes.values())
            validate_push_only_polling(driver.transport, merged_strategy)
        metadata_fields = DriverMetadata.model_fields
        for field, value in resolved.items():
            target = driver.metadata if field in metadata_fields else driver
            setattr(target, field, value)
        await self._persist(driver)
        return driver

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
        driver.attributes[attribute_id] = updated
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
        del driver.attributes[attribute_id]
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
        remaining = [
            renamed if aid == attribute_id else a
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
