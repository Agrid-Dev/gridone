from unittest.mock import AsyncMock

import pytest

from devices_manager.core.codecs.factory import CodecSpec
from devices_manager.core.device.attribute import AttributeKind
from devices_manager.core.driver.attribute_driver import (
    AttributeDriver,
    FaultAttributeDriver,
)
from devices_manager.core.driver.healthcheck import HealthCheck
from devices_manager.core.driver.update_strategy import UpdateStrategy
from devices_manager.core.driver_registry import DriverRegistry
from devices_manager.dto import (
    AttributePatch,
    DriverPatch,
    DriverSpec,
    driver_to_public,
)
from devices_manager.storage import StorageBackend
from devices_manager.types import DataType
from models.errors import ConflictError, InvalidError, NotFoundError
from models.types import Severity


class TestDriverRegistryIds:
    def test_ids_empty(self):
        registry = DriverRegistry()
        assert registry.ids == set()

    def test_ids_returns_driver_ids(self, driver):
        registry = DriverRegistry({driver.id: driver})
        assert registry.ids == {driver.id}


class TestDriverRegistryList:
    def test_list_empty(self):
        registry = DriverRegistry()
        assert registry.list_all() == []

    def test_list_returns_dtos(self, driver):
        registry = DriverRegistry({driver.id: driver})
        result = registry.list_all()
        assert len(result) == 1
        assert isinstance(result[0], DriverSpec)
        assert result[0].id == driver.id

    def test_list_filter_by_type(self, thermostat_driver, other_http_driver):
        registry = DriverRegistry(
            {
                thermostat_driver.id: thermostat_driver,
                other_http_driver.id: other_http_driver,
            }
        )
        result = registry.list_all(device_type="thermostat")
        assert len(result) == 1
        assert result[0].id == thermostat_driver.id

    def test_list_filter_by_type_no_match(self, driver):
        registry = DriverRegistry({driver.id: driver})
        assert registry.list_all(device_type="unknown") == []


class TestDriverRegistryGet:
    def test_get_existing(self, driver):
        registry = DriverRegistry({driver.id: driver})
        result = registry.get(driver.id)
        assert result is driver

    def test_get_not_found(self):
        registry = DriverRegistry()
        with pytest.raises(NotFoundError):
            registry.get("unknown")

    def test_get_dto_existing(self, driver):
        registry = DriverRegistry({driver.id: driver})
        dto = registry.get_dto(driver.id)
        assert isinstance(dto, DriverSpec)
        assert dto.id == driver.id

    def test_get_dto_not_found(self):
        registry = DriverRegistry()
        with pytest.raises(NotFoundError):
            registry.get_dto("unknown")


class TestDriverRegistryAdd:
    @pytest.mark.asyncio
    async def test_add_ok(self, driver):
        registry = DriverRegistry()
        driver_dto = driver_to_public(driver)
        created = await registry.add(driver_dto)
        assert isinstance(created, DriverSpec)
        assert created.id == driver_dto.id
        assert driver_dto.id in registry.ids

    @pytest.mark.asyncio
    async def test_add_duplicate_raises(self, driver):
        registry = DriverRegistry()
        driver_dto = driver_to_public(driver)
        await registry.add(driver_dto)
        with pytest.raises(ConflictError):
            await registry.add(driver_dto)

    @pytest.mark.asyncio
    async def test_add_with_reserved_connection_status_attribute_rejected(self, driver):
        registry = DriverRegistry()
        driver_dto = driver_to_public(driver)
        renamed_attrs = [
            a.model_copy(update={"name": "connection_status"})
            if a.name == "temperature"
            else a
            for a in driver_dto.attributes
        ]
        driver_dto = driver_dto.model_copy(update={"attributes": renamed_attrs})
        with pytest.raises(InvalidError):
            await registry.add(driver_dto)
        assert driver_dto.id not in registry.ids


class TestDriverRegistryPatch:
    @pytest.mark.asyncio
    async def test_patch_vendor(self, driver):
        registry = DriverRegistry({driver.id: driver})
        result = await registry.patch(driver.id, DriverPatch(vendor="Acme"))
        assert result.vendor == "Acme"
        assert result.id == driver.id

    @pytest.mark.asyncio
    async def test_patch_bumps_updated_at_keeps_created_at(self, driver):
        registry = DriverRegistry({driver.id: driver})
        original_created_at = driver.metadata.created_at
        original_updated_at = driver.metadata.updated_at
        result = await registry.patch(driver.id, DriverPatch(vendor="Acme"))
        assert result.created_at == original_created_at
        assert result.updated_at > original_updated_at

    @pytest.mark.asyncio
    async def test_patch_env(self, driver):
        registry = DriverRegistry({driver.id: driver})
        result = await registry.patch(
            driver.id, DriverPatch(env={"base_url": "http://new.example.com"})
        )
        assert result.env == {"base_url": "http://new.example.com"}

    @pytest.mark.asyncio
    async def test_patch_only_supplied_fields(self, driver):
        registry = DriverRegistry({driver.id: driver})
        original_env = dict(driver.env)
        result = await registry.patch(driver.id, DriverPatch(vendor="Acme"))
        assert result.env == original_env

    @pytest.mark.asyncio
    async def test_patch_update_strategy_deep_merge(self, driver):
        """Patching one update_strategy field leaves the rest intact and typed."""
        registry = DriverRegistry({driver.id: driver})
        original_enabled = driver.update_strategy.polling_enabled
        original_timeout = driver.update_strategy.read_timeout
        result = await registry.patch(
            driver.id,
            DriverPatch(update_strategy=UpdateStrategy(polling_interval=30)),
        )
        assert result.update_strategy.polling_interval == 30
        assert result.update_strategy.polling_enabled == original_enabled
        assert result.update_strategy.read_timeout == original_timeout
        assert isinstance(driver.update_strategy, UpdateStrategy)

    @pytest.mark.asyncio
    async def test_patch_healthcheck(self, driver):
        registry = DriverRegistry({driver.id: driver})
        result = await registry.patch(
            driver.id,
            DriverPatch(healthcheck=HealthCheck(expected_push_interval=30)),
        )
        assert result.healthcheck.expected_push_interval == 30
        assert isinstance(driver.healthcheck, HealthCheck)

    @pytest.mark.asyncio
    async def test_patch_image_src(self, driver):
        registry = DriverRegistry({driver.id: driver})
        result = await registry.patch(
            driver.id, DriverPatch(image_src="https://example.com/device.png")
        )
        assert result.image_src == "https://example.com/device.png"

    @pytest.mark.asyncio
    async def test_patch_type(self, thermostat_driver):
        registry = DriverRegistry({thermostat_driver.id: thermostat_driver})
        result = await registry.patch(
            thermostat_driver.id, DriverPatch(type="thermostat")
        )
        assert result.type == "thermostat"

    @pytest.mark.asyncio
    async def test_patch_type_invalid_schema(self, driver):
        registry = DriverRegistry({driver.id: driver})
        with pytest.raises(ConflictError):
            await registry.patch(driver.id, DriverPatch(type="thermostat"))

    @pytest.mark.asyncio
    async def test_patch_type_null_clears_type(self, thermostat_driver):
        registry = DriverRegistry({thermostat_driver.id: thermostat_driver})
        result = await registry.patch(thermostat_driver.id, DriverPatch(type=None))
        assert result.type is None

    @pytest.mark.asyncio
    async def test_patch_not_found(self):
        registry = DriverRegistry()
        with pytest.raises(NotFoundError):
            await registry.patch("unknown", DriverPatch())

    @pytest.mark.asyncio
    async def test_patch_persists_to_storage(self, driver):
        storage = AsyncMock(spec=StorageBackend)
        registry = DriverRegistry({driver.id: driver}, storage=storage)
        await registry.patch(driver.id, DriverPatch(vendor="Acme"))
        storage.write.assert_called_once()

    @pytest.mark.asyncio
    async def test_patch_update_strategy_removing_referenced_group_rejected(
        self, driver
    ):
        registry = DriverRegistry({driver.id: driver})
        driver.update_strategy = UpdateStrategy(polling_groups={"core": 5})
        driver.attributes["temperature"] = driver.attributes["temperature"].model_copy(
            update={"polling_group": "core"}
        )
        with pytest.raises(InvalidError):
            await registry.patch(
                driver.id,
                DriverPatch(update_strategy=UpdateStrategy(polling_groups={})),
            )
        # rejected before mutating: the driver keeps its original polling_groups
        assert driver.update_strategy.polling_groups == {"core": 5}

    @pytest.mark.asyncio
    async def test_patch_update_strategy_new_polling_group_ok(self, driver):
        registry = DriverRegistry({driver.id: driver})
        result = await registry.patch(
            driver.id,
            DriverPatch(update_strategy=UpdateStrategy(polling_groups={"core": 5})),
        )
        assert result.update_strategy.polling_groups == {"core": 5}


class TestDriverRegistryCreateAttribute:
    @pytest.mark.asyncio
    async def test_create_ok(self, driver):
        registry = DriverRegistry({driver.id: driver})
        new_attr = AttributeDriver(
            name="pressure",
            data_type=DataType.FLOAT,
            read="GET /pressure",
            write=None,
            codecs=[],
        )
        result = await registry.create_driver_attribute(driver.id, new_attr)
        assert result.name == "pressure"
        assert driver.attributes["pressure"] is result

    @pytest.mark.asyncio
    async def test_create_driver_not_found(self):
        registry = DriverRegistry()
        new_attr = AttributeDriver(
            name="pressure", data_type=DataType.FLOAT, read="GET /pressure", codecs=[]
        )
        with pytest.raises(NotFoundError):
            await registry.create_driver_attribute("unknown", new_attr)

    @pytest.mark.asyncio
    async def test_create_duplicate_name_raises(self, driver):
        registry = DriverRegistry({driver.id: driver})
        new_attr = AttributeDriver(
            name="temperature",
            data_type=DataType.FLOAT,
            read="GET /temperature",
            codecs=[],
        )
        with pytest.raises(ConflictError):
            await registry.create_driver_attribute(driver.id, new_attr)

    @pytest.mark.asyncio
    async def test_create_reserved_connection_status_name_rejected(self, driver):
        registry = DriverRegistry({driver.id: driver})
        new_attr = AttributeDriver(
            name="connection_status", data_type=DataType.BOOL, read="GET /cs", codecs=[]
        )
        with pytest.raises(InvalidError):
            await registry.create_driver_attribute(driver.id, new_attr)

    @pytest.mark.asyncio
    async def test_create_persists_to_storage(self, driver):
        storage = AsyncMock(spec=StorageBackend)
        registry = DriverRegistry({driver.id: driver}, storage=storage)
        new_attr = AttributeDriver(
            name="pressure", data_type=DataType.FLOAT, read="GET /pressure", codecs=[]
        )
        await registry.create_driver_attribute(driver.id, new_attr)
        storage.write.assert_called_once()

    @pytest.mark.asyncio
    async def test_create_non_snake_case_name_rejected(self, driver):
        registry = DriverRegistry({driver.id: driver})
        new_attr = AttributeDriver(
            name="Temperature",
            data_type=DataType.FLOAT,
            read="GET /temperature2",
            codecs=[],
        )
        with pytest.raises(InvalidError):
            await registry.create_driver_attribute(driver.id, new_attr)
        assert "Temperature" not in driver.attributes

    @pytest.mark.asyncio
    async def test_create_undeclared_polling_group_rejected(self, driver):
        registry = DriverRegistry({driver.id: driver})
        new_attr = AttributeDriver(
            name="pressure",
            data_type=DataType.FLOAT,
            read="GET /pressure",
            codecs=[],
            polling_group="core",
        )
        with pytest.raises(InvalidError):
            await registry.create_driver_attribute(driver.id, new_attr)
        assert "pressure" not in driver.attributes

    @pytest.mark.asyncio
    async def test_create_declared_polling_group_ok(self, driver):
        registry = DriverRegistry({driver.id: driver})
        driver.update_strategy = UpdateStrategy(polling_groups={"core": 5})
        new_attr = AttributeDriver(
            name="pressure",
            data_type=DataType.FLOAT,
            read="GET /pressure",
            codecs=[],
            polling_group="core",
        )
        result = await registry.create_driver_attribute(driver.id, new_attr)
        assert result.polling_group == "core"


class TestDriverRegistryPatchAttribute:
    @pytest.mark.asyncio
    async def test_patch_read_address(self, driver):
        registry = DriverRegistry({driver.id: driver})
        result = await registry.patch_driver_attribute(
            driver.id, "temperature", AttributePatch(read="GET /temp/v2")
        )
        assert result.read == "GET /temp/v2"
        assert result.name == "temperature"

    @pytest.mark.asyncio
    async def test_patch_only_supplied_fields(self, driver):
        registry = DriverRegistry({driver.id: driver})
        original_write = driver.attributes["temperature"].write
        result = await registry.patch_driver_attribute(
            driver.id, "temperature", AttributePatch(read="GET /temp/v2")
        )
        assert result.write == original_write

    @pytest.mark.asyncio
    async def test_patch_codecs(self, driver):
        registry = DriverRegistry({driver.id: driver})
        result = await registry.patch_driver_attribute(
            driver.id,
            "temperature",
            AttributePatch(codecs=[{"json_pointer": "/data/temp"}]),
        )
        assert len(result.codecs) == 1
        assert isinstance(result.codecs[0], CodecSpec)
        assert result.codecs[0].name == "json_pointer"

    @pytest.mark.asyncio
    async def test_patch_kind_standard_to_fault(self, driver):
        """Changing kind rebuilds the attribute as FaultAttributeDriver."""
        registry = DriverRegistry({driver.id: driver})
        result = await registry.patch_driver_attribute(
            driver.id, "temperature", AttributePatch(kind=AttributeKind.FAULT)
        )
        assert isinstance(result, FaultAttributeDriver)
        assert isinstance(driver.attributes["temperature"], FaultAttributeDriver)

    @pytest.mark.asyncio
    async def test_patch_kind_fault_to_standard_drops_fault_fields(self, driver):
        """Downgrading kind rebuilds as AttributeDriver, dropping stale fault fields."""
        registry = DriverRegistry({driver.id: driver})
        await registry.patch_driver_attribute(
            driver.id,
            "temperature",
            AttributePatch(
                kind=AttributeKind.FAULT, severity=Severity.ALERT, healthy_values=[1]
            ),
        )

        result = await registry.patch_driver_attribute(
            driver.id, "temperature", AttributePatch(kind=AttributeKind.STANDARD)
        )

        assert type(result) is AttributeDriver
        assert not hasattr(result, "severity")
        assert not hasattr(result, "healthy_values")

    @pytest.mark.asyncio
    async def test_patch_driver_not_found(self):
        registry = DriverRegistry()
        with pytest.raises(NotFoundError):
            await registry.patch_driver_attribute(
                "unknown", "temperature", AttributePatch()
            )

    @pytest.mark.asyncio
    async def test_patch_driver_attribute_not_found(self, driver):
        registry = DriverRegistry({driver.id: driver})
        with pytest.raises(NotFoundError):
            await registry.patch_driver_attribute(
                driver.id, "nonexistent", AttributePatch()
            )

    @pytest.mark.asyncio
    async def test_patch_persists_to_storage(self, driver):
        storage = AsyncMock(spec=StorageBackend)
        registry = DriverRegistry({driver.id: driver}, storage=storage)
        await registry.patch_driver_attribute(
            driver.id, "temperature", AttributePatch(read="GET /temp/v2")
        )
        storage.write.assert_called_once()

    @pytest.mark.asyncio
    async def test_patch_undeclared_polling_group_rejected(self, driver):
        registry = DriverRegistry({driver.id: driver})
        with pytest.raises(InvalidError):
            await registry.patch_driver_attribute(
                driver.id, "temperature", AttributePatch(polling_group="core")
            )
        assert driver.attributes["temperature"].polling_group is None

    @pytest.mark.asyncio
    async def test_patch_declared_polling_group_ok(self, driver):
        registry = DriverRegistry({driver.id: driver})
        driver.update_strategy = UpdateStrategy(polling_groups={"core": 5})
        result = await registry.patch_driver_attribute(
            driver.id, "temperature", AttributePatch(polling_group="core")
        )
        assert result.polling_group == "core"

    @pytest.mark.asyncio
    async def test_patch_polling_group_null_clears_it(self, driver):
        registry = DriverRegistry({driver.id: driver})
        driver.update_strategy = UpdateStrategy(polling_groups={"core": 5})
        await registry.patch_driver_attribute(
            driver.id, "temperature", AttributePatch(polling_group="core")
        )
        result = await registry.patch_driver_attribute(
            driver.id, "temperature", AttributePatch(polling_group=None)
        )
        assert result.polling_group is None


class TestDriverRegistryDeleteAttribute:
    @pytest.mark.asyncio
    async def test_delete_existing(self, driver):
        registry = DriverRegistry({driver.id: driver})
        result = await registry.delete_driver_attribute(driver.id, "temperature")
        assert isinstance(result, DriverSpec)
        assert all(attr.name != "temperature" for attr in result.attributes)
        assert "temperature" not in driver.attributes

    @pytest.mark.asyncio
    async def test_delete_driver_not_found(self):
        registry = DriverRegistry()
        with pytest.raises(NotFoundError):
            await registry.delete_driver_attribute("unknown", "temperature")

    @pytest.mark.asyncio
    async def test_delete_attribute_not_found(self, driver):
        registry = DriverRegistry({driver.id: driver})
        with pytest.raises(NotFoundError):
            await registry.delete_driver_attribute(driver.id, "nonexistent")

    @pytest.mark.asyncio
    async def test_delete_persists_to_storage(self, driver):
        storage = AsyncMock(spec=StorageBackend)
        registry = DriverRegistry({driver.id: driver}, storage=storage)
        await registry.delete_driver_attribute(driver.id, "temperature")
        storage.write.assert_called_once()

    @pytest.mark.asyncio
    async def test_delete_required_standard_attribute_conflicts(
        self, thermostat_driver
    ):
        registry = DriverRegistry({thermostat_driver.id: thermostat_driver})
        with pytest.raises(ConflictError):
            await registry.delete_driver_attribute(thermostat_driver.id, "temperature")
        assert "temperature" in thermostat_driver.attributes

    @pytest.mark.asyncio
    async def test_delete_required_standard_attribute_does_not_persist(
        self, thermostat_driver
    ):
        storage = AsyncMock(spec=StorageBackend)
        registry = DriverRegistry(
            {thermostat_driver.id: thermostat_driver}, storage=storage
        )
        with pytest.raises(ConflictError):
            await registry.delete_driver_attribute(thermostat_driver.id, "temperature")
        storage.write.assert_not_called()

    @pytest.mark.asyncio
    async def test_delete_optional_standard_attribute_ok(self, thermostat_driver):
        """Non-required/optional standard fields are deletable."""
        registry = DriverRegistry({thermostat_driver.id: thermostat_driver})
        result = await registry.delete_driver_attribute(
            thermostat_driver.id, "temperature_setpoint_min"
        )
        assert isinstance(result, DriverSpec)
        assert all(
            attr.name != "temperature_setpoint_min" for attr in result.attributes
        )
        assert "temperature_setpoint_min" not in thermostat_driver.attributes


class TestDriverRegistryRenameAttribute:
    @pytest.mark.asyncio
    async def test_rename_existing(self, driver):
        registry = DriverRegistry({driver.id: driver})
        result = await registry.rename_driver_attribute(
            driver.id, "temperature", "temp"
        )
        assert result.name == "temp"
        assert "temp" in driver.attributes
        assert "temperature" not in driver.attributes

    @pytest.mark.asyncio
    async def test_rename_driver_not_found(self):
        registry = DriverRegistry()
        with pytest.raises(NotFoundError):
            await registry.rename_driver_attribute("unknown", "temperature", "temp")

    @pytest.mark.asyncio
    async def test_rename_to_reserved_connection_status_name_rejected(self, driver):
        registry = DriverRegistry({driver.id: driver})
        with pytest.raises(InvalidError):
            await registry.rename_driver_attribute(
                driver.id, "temperature", "connection_status"
            )
        assert "temperature" in driver.attributes

    @pytest.mark.asyncio
    async def test_rename_attribute_not_found(self, driver):
        registry = DriverRegistry({driver.id: driver})
        with pytest.raises(NotFoundError):
            await registry.rename_driver_attribute(driver.id, "nonexistent", "temp")

    @pytest.mark.asyncio
    async def test_rename_to_existing_name_conflict(self, driver):
        registry = DriverRegistry({driver.id: driver})
        with pytest.raises(InvalidError):
            await registry.rename_driver_attribute(driver.id, "temperature", "humidity")

    @pytest.mark.asyncio
    async def test_rename_to_non_snake_case_name_rejected(self, driver):
        registry = DriverRegistry({driver.id: driver})
        with pytest.raises(InvalidError):
            await registry.rename_driver_attribute(
                driver.id, "temperature", "Temperature"
            )
        assert "temperature" in driver.attributes

    @pytest.mark.asyncio
    async def test_rename_to_same_name_is_noop_ok(self, driver):
        registry = DriverRegistry({driver.id: driver})
        result = await registry.rename_driver_attribute(
            driver.id, "temperature", "temperature"
        )
        assert result.name == "temperature"

    @pytest.mark.asyncio
    async def test_rename_persists_to_storage(self, driver):
        storage = AsyncMock(spec=StorageBackend)
        registry = DriverRegistry({driver.id: driver}, storage=storage)
        await registry.rename_driver_attribute(driver.id, "temperature", "temp")
        storage.write.assert_called_once()

    @pytest.mark.asyncio
    async def test_rename_required_standard_attribute_conflicts(
        self, thermostat_driver
    ):
        registry = DriverRegistry({thermostat_driver.id: thermostat_driver})
        with pytest.raises(ConflictError):
            await registry.rename_driver_attribute(
                thermostat_driver.id, "temperature", "temp"
            )
        assert "temperature" in thermostat_driver.attributes

    @pytest.mark.asyncio
    async def test_rename_required_standard_attribute_does_not_persist(
        self, thermostat_driver
    ):
        storage = AsyncMock(spec=StorageBackend)
        registry = DriverRegistry(
            {thermostat_driver.id: thermostat_driver}, storage=storage
        )
        with pytest.raises(ConflictError):
            await registry.rename_driver_attribute(
                thermostat_driver.id, "temperature", "temp"
            )
        storage.write.assert_not_called()

    @pytest.mark.asyncio
    async def test_rename_optional_standard_attribute_ok(self, thermostat_driver):
        registry = DriverRegistry({thermostat_driver.id: thermostat_driver})
        result = await registry.rename_driver_attribute(
            thermostat_driver.id, "temperature_setpoint_min", "min_setpoint"
        )
        assert result.name == "min_setpoint"
        assert "min_setpoint" in thermostat_driver.attributes
        assert "temperature_setpoint_min" not in thermostat_driver.attributes


class TestDriverRegistryRemove:
    @pytest.mark.asyncio
    async def test_remove_existing(self, driver):
        registry = DriverRegistry({driver.id: driver})
        await registry.remove(driver.id)
        assert driver.id not in registry.ids

    @pytest.mark.asyncio
    async def test_remove_not_found(self):
        registry = DriverRegistry()
        with pytest.raises(NotFoundError):
            await registry.remove("unknown")


class TestDriverRegistryCheckCompat:
    def test_compatible(self, driver, mock_transport_client):
        DriverRegistry.check_transport_compat(driver, mock_transport_client)

    def test_incompatible(self, driver, mock_push_transport_client):
        with pytest.raises(ValueError):  # noqa: PT011
            DriverRegistry.check_transport_compat(driver, mock_push_transport_client)


class TestDriverRegistryPersistence:
    @pytest.mark.asyncio
    async def test_add_persists_to_storage(self, driver):
        storage = AsyncMock(spec=StorageBackend)
        registry = DriverRegistry(storage=storage)
        driver_dto = driver_to_public(driver)
        await registry.add(driver_dto)
        storage.write.assert_called_once()

    @pytest.mark.asyncio
    async def test_remove_deletes_from_storage(self, driver):
        storage = AsyncMock(spec=StorageBackend)
        registry = DriverRegistry({driver.id: driver}, storage=storage)
        await registry.remove(driver.id)
        storage.delete.assert_called_once_with(driver.id)

    @pytest.mark.asyncio
    async def test_no_storage_does_not_raise(self, driver):
        registry = DriverRegistry()
        driver_dto = driver_to_public(driver)
        created = await registry.add(driver_dto)
        assert created.id == driver_dto.id
        await registry.remove(driver_dto.id)
        assert driver_dto.id not in registry.ids
