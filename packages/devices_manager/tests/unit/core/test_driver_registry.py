from unittest.mock import AsyncMock

import pytest

from devices_manager.core.codecs.factory import CodecSpec
from devices_manager.core.device.attribute import AttributeKind
from devices_manager.core.driver import (
    AttributeRef,
    DriverStorage,
    LocalizedText,
    WriteConstraints,
)
from devices_manager.core.driver.attribute_driver import (
    AttributeDriver,
    FaultAttributeDriver,
)
from devices_manager.core.driver.healthcheck import HealthCheck
from devices_manager.core.driver.update_strategy import UpdateStrategy
from devices_manager.core.driver_registry import DriverRegistry
from devices_manager.core.presentation import (
    AvailablePresentation,
    DiagnosticCode,
    PresentationEnvelope,
    UnavailablePresentation,
)
from devices_manager.types import DataType
from models.errors import ConflictError, InvalidError, NotFoundError
from models.types import Severity

from .fixtures.presentations import (
    LAYERS_PATH,
    load_thermostat_presentation,
    put,
    thermostat_presentation_driver,
)


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

    def test_list_returns_drivers(self, driver):
        registry = DriverRegistry({driver.id: driver})
        assert registry.list_all() == [driver]

    def test_list_filter_by_type(self, thermostat_driver, other_http_driver):
        registry = DriverRegistry(
            {
                thermostat_driver.id: thermostat_driver,
                other_http_driver.id: other_http_driver,
            }
        )
        result = registry.list_all(device_type="thermostat")
        assert result == [thermostat_driver]

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


class TestDriverRegistryAdd:
    @pytest.mark.asyncio
    async def test_add_ok(self, driver):
        registry = DriverRegistry()
        created = await registry.add(driver)
        assert created is driver
        assert driver.id in registry.ids

    @pytest.mark.asyncio
    async def test_add_duplicate_raises(self, driver):
        registry = DriverRegistry()
        await registry.add(driver)
        with pytest.raises(ConflictError):
            await registry.add(driver)

    @pytest.mark.asyncio
    async def test_add_with_reserved_connection_status_attribute_rejected(self, driver):
        registry = DriverRegistry()
        renamed = driver.attributes.pop("temperature").model_copy(
            update={"name": "connection_status"}
        )
        driver.attributes["connection_status"] = renamed
        with pytest.raises(InvalidError):
            await registry.add(driver)
        assert driver.id not in registry.ids


class TestDriverRegistryPatch:
    @pytest.mark.asyncio
    async def test_patch_vendor(self, driver):
        registry = DriverRegistry({driver.id: driver})
        result = await registry.patch(driver.id, {"vendor": "Acme"})
        assert result.metadata.vendor == "Acme"
        assert result.id == driver.id

    @pytest.mark.asyncio
    async def test_patch_bumps_updated_at_keeps_created_at(self, driver):
        registry = DriverRegistry({driver.id: driver})
        original_created_at = driver.metadata.created_at
        original_updated_at = driver.metadata.updated_at
        result = await registry.patch(driver.id, {"vendor": "Acme"})
        assert result.metadata.created_at == original_created_at
        assert result.metadata.updated_at > original_updated_at

    @pytest.mark.asyncio
    async def test_patch_env(self, driver):
        registry = DriverRegistry({driver.id: driver})
        result = await registry.patch(
            driver.id, {"env": {"base_url": "http://new.example.com"}}
        )
        assert result.env == {"base_url": "http://new.example.com"}

    @pytest.mark.asyncio
    async def test_patch_only_supplied_fields(self, driver):
        registry = DriverRegistry({driver.id: driver})
        original_env = dict(driver.env)
        result = await registry.patch(driver.id, {"vendor": "Acme"})
        assert result.env == original_env

    @pytest.mark.asyncio
    async def test_patch_update_strategy_deep_merge(self, driver):
        """Patching one update_strategy field leaves the rest intact and typed."""
        registry = DriverRegistry({driver.id: driver})
        original_enabled = driver.update_strategy.polling_enabled
        original_timeout = driver.update_strategy.read_timeout
        result = await registry.patch(
            driver.id, {"update_strategy": {"polling_interval": 30}}
        )
        assert result.update_strategy.polling_interval == 30
        assert result.update_strategy.polling_enabled == original_enabled
        assert result.update_strategy.read_timeout == original_timeout
        assert isinstance(driver.update_strategy, UpdateStrategy)

    @pytest.mark.asyncio
    async def test_patch_cannot_enable_polling_on_webhook_driver(self, webhook_driver):
        registry = DriverRegistry({webhook_driver.id: webhook_driver})
        with pytest.raises(InvalidError, match="push-only"):
            await registry.patch(
                webhook_driver.id, {"update_strategy": {"polling_enabled": True}}
            )

    @pytest.mark.asyncio
    async def test_patch_healthcheck(self, driver):
        registry = DriverRegistry({driver.id: driver})
        result = await registry.patch(
            driver.id, {"healthcheck": {"expected_push_interval": 30}}
        )
        assert result.healthcheck.expected_push_interval == 30
        assert isinstance(driver.healthcheck, HealthCheck)

    @pytest.mark.asyncio
    async def test_patch_image_src(self, driver):
        registry = DriverRegistry({driver.id: driver})
        result = await registry.patch(
            driver.id, {"image_src": "https://example.com/device.png"}
        )
        assert result.metadata.image_src == "https://example.com/device.png"

    @pytest.mark.asyncio
    async def test_patch_type(self, thermostat_driver):
        registry = DriverRegistry({thermostat_driver.id: thermostat_driver})
        result = await registry.patch(thermostat_driver.id, {"type": "thermostat"})
        assert result.type == "thermostat"

    @pytest.mark.asyncio
    async def test_patch_type_invalid_schema(self, driver):
        registry = DriverRegistry({driver.id: driver})
        with pytest.raises(ConflictError):
            await registry.patch(driver.id, {"type": "thermostat"})

    @pytest.mark.asyncio
    async def test_patch_type_null_clears_type(self, thermostat_driver):
        registry = DriverRegistry({thermostat_driver.id: thermostat_driver})
        result = await registry.patch(thermostat_driver.id, {"type": None})
        assert result.type is None

    @pytest.mark.asyncio
    async def test_patch_not_found(self):
        registry = DriverRegistry()
        with pytest.raises(NotFoundError):
            await registry.patch("unknown", {})

    @pytest.mark.asyncio
    async def test_patch_persists_to_storage(self, driver):
        storage = AsyncMock(spec=DriverStorage)
        registry = DriverRegistry({driver.id: driver}, storage=storage)
        await registry.patch(driver.id, {"vendor": "Acme"})
        storage.write.assert_called_once_with(driver.id, driver)

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
            await registry.patch(driver.id, {"update_strategy": {"polling_groups": {}}})
        # rejected before mutating: the driver keeps its original polling_groups
        assert driver.update_strategy.polling_groups == {"core": 5}

    @pytest.mark.asyncio
    async def test_patch_update_strategy_new_polling_group_ok(self, driver):
        registry = DriverRegistry({driver.id: driver})
        result = await registry.patch(
            driver.id, {"update_strategy": {"polling_groups": {"core": 5}}}
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
        storage = AsyncMock(spec=DriverStorage)
        registry = DriverRegistry({driver.id: driver}, storage=storage)
        new_attr = AttributeDriver(
            name="pressure", data_type=DataType.FLOAT, read="GET /pressure", codecs=[]
        )
        await registry.create_driver_attribute(driver.id, new_attr)
        storage.write.assert_called_once_with(driver.id, driver)

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
            driver.id, "temperature", {"read": "GET /temp/v2"}
        )
        assert result.read == "GET /temp/v2"
        assert result.name == "temperature"

    @pytest.mark.asyncio
    async def test_patch_only_supplied_fields(self, driver):
        registry = DriverRegistry({driver.id: driver})
        original_write = driver.attributes["temperature"].write
        result = await registry.patch_driver_attribute(
            driver.id, "temperature", {"read": "GET /temp/v2"}
        )
        assert result.write == original_write

    @pytest.mark.asyncio
    async def test_patch_codecs(self, driver):
        registry = DriverRegistry({driver.id: driver})
        result = await registry.patch_driver_attribute(
            driver.id, "temperature", {"codecs": [{"json_pointer": "/data/temp"}]}
        )
        assert len(result.codecs) == 1
        assert isinstance(result.codecs[0], CodecSpec)
        assert result.codecs[0].name == "json_pointer"

    @pytest.mark.asyncio
    async def test_patch_kind_standard_to_fault(self, driver):
        """Changing kind rebuilds the attribute as FaultAttributeDriver."""
        registry = DriverRegistry({driver.id: driver})
        result = await registry.patch_driver_attribute(
            driver.id, "temperature", {"kind": AttributeKind.FAULT}
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
            {
                "kind": AttributeKind.FAULT,
                "severity": Severity.ALERT,
                "healthy_values": [1],
            },
        )

        result = await registry.patch_driver_attribute(
            driver.id, "temperature", {"kind": AttributeKind.STANDARD}
        )

        assert type(result) is AttributeDriver
        assert not hasattr(result, "severity")
        assert not hasattr(result, "healthy_values")

    @pytest.mark.asyncio
    async def test_patch_driver_not_found(self):
        registry = DriverRegistry()
        with pytest.raises(NotFoundError):
            await registry.patch_driver_attribute("unknown", "temperature", {})

    @pytest.mark.asyncio
    async def test_patch_driver_attribute_not_found(self, driver):
        registry = DriverRegistry({driver.id: driver})
        with pytest.raises(NotFoundError):
            await registry.patch_driver_attribute(driver.id, "nonexistent", {})

    @pytest.mark.asyncio
    async def test_patch_persists_to_storage(self, driver):
        storage = AsyncMock(spec=DriverStorage)
        registry = DriverRegistry({driver.id: driver}, storage=storage)
        await registry.patch_driver_attribute(
            driver.id, "temperature", {"read": "GET /temp/v2"}
        )
        storage.write.assert_called_once_with(driver.id, driver)

    @pytest.mark.asyncio
    async def test_patch_undeclared_polling_group_rejected(self, driver):
        registry = DriverRegistry({driver.id: driver})
        with pytest.raises(InvalidError):
            await registry.patch_driver_attribute(
                driver.id, "temperature", {"polling_group": "core"}
            )
        assert driver.attributes["temperature"].polling_group is None

    @pytest.mark.asyncio
    async def test_patch_declared_polling_group_ok(self, driver):
        registry = DriverRegistry({driver.id: driver})
        driver.update_strategy = UpdateStrategy(polling_groups={"core": 5})
        result = await registry.patch_driver_attribute(
            driver.id, "temperature", {"polling_group": "core"}
        )
        assert result.polling_group == "core"

    @pytest.mark.asyncio
    async def test_patch_polling_group_null_clears_it(self, driver):
        registry = DriverRegistry({driver.id: driver})
        driver.update_strategy = UpdateStrategy(polling_groups={"core": 5})
        await registry.patch_driver_attribute(
            driver.id, "temperature", {"polling_group": "core"}
        )
        result = await registry.patch_driver_attribute(
            driver.id, "temperature", {"polling_group": None}
        )
        assert result.polling_group is None


class TestDriverRegistryDeleteAttribute:
    @pytest.mark.asyncio
    async def test_delete_existing(self, driver):
        registry = DriverRegistry({driver.id: driver})
        result = await registry.delete_driver_attribute(driver.id, "temperature")
        assert result is driver
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
        storage = AsyncMock(spec=DriverStorage)
        registry = DriverRegistry({driver.id: driver}, storage=storage)
        await registry.delete_driver_attribute(driver.id, "temperature")
        storage.write.assert_called_once_with(driver.id, driver)

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
        storage = AsyncMock(spec=DriverStorage)
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
        assert "temperature_setpoint_min" not in result.attributes
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
        storage = AsyncMock(spec=DriverStorage)
        registry = DriverRegistry({driver.id: driver}, storage=storage)
        await registry.rename_driver_attribute(driver.id, "temperature", "temp")
        storage.write.assert_called_once_with(driver.id, driver)

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
        storage = AsyncMock(spec=DriverStorage)
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
        storage = AsyncMock(spec=DriverStorage)
        registry = DriverRegistry(storage=storage)
        await registry.add(driver)
        storage.write.assert_called_once_with(driver.id, driver)

    @pytest.mark.asyncio
    async def test_remove_deletes_from_storage(self, driver):
        storage = AsyncMock(spec=DriverStorage)
        registry = DriverRegistry({driver.id: driver}, storage=storage)
        await registry.remove(driver.id)
        storage.delete.assert_called_once_with(driver.id)

    @pytest.mark.asyncio
    async def test_no_storage_does_not_raise(self, driver):
        registry = DriverRegistry()
        created = await registry.add(driver)
        assert created is driver
        await registry.remove(driver.id)
        assert driver.id not in registry.ids


def _with_constraints(
    name: str, data_type: DataType, constraints: WriteConstraints
) -> AttributeDriver:
    return AttributeDriver(
        name=name,
        data_type=data_type,
        read=f"GET /{name}",
        write=f"POST /{name}",
        codecs=[],
        write_constraints=constraints,
    )


class TestDriverRegistryWriteConstraints:
    """Candidate validation on every attribute mutation, and the structural
    handling of bounds that reference sibling attributes."""

    @pytest.mark.asyncio
    async def test_create_with_constraints_on_string_attribute_rejected(
        self, constrained_driver
    ):
        storage = AsyncMock(spec=DriverStorage)
        registry = DriverRegistry(
            {constrained_driver.id: constrained_driver}, storage=storage
        )
        new_attr = _with_constraints(
            "preset", DataType.STRING, WriteConstraints(minimum=0, maximum=3)
        )
        with pytest.raises(InvalidError, match=r"'preset'.*not numeric"):
            await registry.create_driver_attribute(constrained_driver.id, new_attr)
        assert "preset" not in constrained_driver.attributes
        storage.write.assert_not_called()

    @pytest.mark.asyncio
    async def test_create_with_reference_to_unknown_attribute_rejected(
        self, constrained_driver
    ):
        registry = DriverRegistry({constrained_driver.id: constrained_driver})
        new_attr = _with_constraints(
            "humidity_setpoint",
            DataType.FLOAT,
            WriteConstraints(maximum=AttributeRef(attribute="humidity_max")),
        )
        with pytest.raises(InvalidError, match="unknown attribute 'humidity_max'"):
            await registry.create_driver_attribute(constrained_driver.id, new_attr)
        assert "humidity_setpoint" not in constrained_driver.attributes

    @pytest.mark.asyncio
    async def test_create_with_reference_to_numeric_sibling_ok(
        self, constrained_driver
    ):
        registry = DriverRegistry({constrained_driver.id: constrained_driver})
        new_attr = _with_constraints(
            "eco_setpoint",
            DataType.FLOAT,
            WriteConstraints(
                minimum=AttributeRef(attribute="temperature_setpoint_min"), step=0.5
            ),
        )
        result = await registry.create_driver_attribute(constrained_driver.id, new_attr)
        assert constrained_driver.attributes["eco_setpoint"] is result

    @pytest.mark.asyncio
    async def test_patch_constraints_onto_string_attribute_rejected(
        self, constrained_driver
    ):
        registry = DriverRegistry({constrained_driver.id: constrained_driver})
        with pytest.raises(InvalidError, match=r"'mode'.*not numeric"):
            await registry.patch_driver_attribute(
                constrained_driver.id, "mode", {"write_constraints": {"step": 1}}
            )
        assert constrained_driver.attributes["mode"].write_constraints is None

    @pytest.mark.asyncio
    async def test_patch_self_reference_rejected(self, constrained_driver):
        registry = DriverRegistry({constrained_driver.id: constrained_driver})
        with pytest.raises(
            InvalidError, match="must not reference the attribute itself"
        ):
            await registry.patch_driver_attribute(
                constrained_driver.id,
                "fan_speed",
                {"write_constraints": {"maximum": {"attribute": "fan_speed"}}},
            )
        assert constrained_driver.attributes[
            "fan_speed"
        ].write_constraints == WriteConstraints(minimum=0, maximum=3)

    @pytest.mark.asyncio
    async def test_patch_valid_constraints_and_metadata_ok(self, constrained_driver):
        registry = DriverRegistry({constrained_driver.id: constrained_driver})
        result = await registry.patch_driver_attribute(
            constrained_driver.id,
            "temperature_setpoint_min",
            {
                "write_constraints": {
                    "maximum": {"attribute": "temperature_setpoint_max"}
                },
                "label": {"default": "Minimum setpoint"},
                "unit": "°C",
                "group": "setpoints",
            },
        )
        assert result.write_constraints == WriteConstraints(
            maximum=AttributeRef(attribute="temperature_setpoint_max")
        )
        assert result.label == LocalizedText(default="Minimum setpoint")
        assert result.unit == "°C"
        assert result.group == "setpoints"

    @pytest.mark.asyncio
    async def test_patch_null_clears_constraints_and_metadata(self, constrained_driver):
        registry = DriverRegistry({constrained_driver.id: constrained_driver})
        result = await registry.patch_driver_attribute(
            constrained_driver.id,
            "temperature_setpoint",
            {"write_constraints": None, "label": None, "unit": None},
        )
        assert result.write_constraints is None
        assert result.label is None
        assert result.unit is None
        # untouched metadata survives the patch
        assert result.group == "setpoints"

    @pytest.mark.asyncio
    async def test_rename_updates_bounds_that_reference_the_attribute(
        self, constrained_driver
    ):
        storage = AsyncMock(spec=DriverStorage)
        registry = DriverRegistry(
            {constrained_driver.id: constrained_driver}, storage=storage
        )
        renamed = await registry.rename_driver_attribute(
            constrained_driver.id, "temperature_setpoint_min", "min_setpoint"
        )
        assert renamed.name == "min_setpoint"
        assert "temperature_setpoint_min" not in constrained_driver.attributes
        setpoint = constrained_driver.attributes["temperature_setpoint"]
        assert setpoint.write_constraints == WriteConstraints(
            step=0.5,
            minimum=AttributeRef(attribute="min_setpoint"),
            maximum=AttributeRef(attribute="temperature_setpoint_max"),
        )
        # constants and unrelated attributes are untouched
        assert constrained_driver.attributes[
            "fan_speed"
        ].write_constraints == WriteConstraints(minimum=0, maximum=3)
        storage.write.assert_called_once_with(constrained_driver.id, constrained_driver)

    @pytest.mark.asyncio
    async def test_rename_to_same_name_keeps_references(self, constrained_driver):
        registry = DriverRegistry({constrained_driver.id: constrained_driver})
        await registry.rename_driver_attribute(
            constrained_driver.id,
            "temperature_setpoint_min",
            "temperature_setpoint_min",
        )
        setpoint = constrained_driver.attributes["temperature_setpoint"]
        assert setpoint.write_constraints is not None
        assert setpoint.write_constraints.minimum == AttributeRef(
            attribute="temperature_setpoint_min"
        )

    @pytest.mark.asyncio
    async def test_delete_referenced_attribute_conflicts(self, constrained_driver):
        storage = AsyncMock(spec=DriverStorage)
        registry = DriverRegistry(
            {constrained_driver.id: constrained_driver}, storage=storage
        )
        with pytest.raises(
            ConflictError, match="write_constraints bound of temperature_setpoint"
        ):
            await registry.delete_driver_attribute(
                constrained_driver.id, "temperature_setpoint_max"
            )
        assert "temperature_setpoint_max" in constrained_driver.attributes
        storage.write.assert_not_called()

    @pytest.mark.asyncio
    async def test_delete_after_clearing_the_reference_ok(self, constrained_driver):
        registry = DriverRegistry({constrained_driver.id: constrained_driver})
        await registry.patch_driver_attribute(
            constrained_driver.id,
            "temperature_setpoint",
            {"write_constraints": {"step": 0.5}},
        )
        result = await registry.delete_driver_attribute(
            constrained_driver.id, "temperature_setpoint_max"
        )
        assert "temperature_setpoint_max" not in result.attributes

    @pytest.mark.asyncio
    async def test_delete_unreferenced_attribute_ok(self, constrained_driver):
        registry = DriverRegistry({constrained_driver.id: constrained_driver})
        result = await registry.delete_driver_attribute(constrained_driver.id, "mode")
        assert "mode" not in result.attributes


def _broken_presentation() -> dict:
    """The thermostat document with one binding on an unknown attribute."""
    document = load_thermostat_presentation()
    put(document, "/bindings/power/attribute", "nope")
    return document


def _future_presentation() -> dict:
    return {"schema_version": 2, "requires": ["layout/2"], "scene": {"kind": "3d"}}


def _codes(status: UnavailablePresentation) -> set[DiagnosticCode]:
    return {diagnostic.code for diagnostic in status.diagnostics}


class TestDriverRegistryPresentation:
    """Candidate validation on import, structural rename, visible fallback
    after an attribute change — never a refused attribute change."""

    @pytest.mark.asyncio
    async def test_add_valid_presentation(self, presented_driver):
        storage = AsyncMock(spec=DriverStorage)
        registry = DriverRegistry(storage=storage)
        await registry.add(presented_driver)
        status = registry.presentation_status(presented_driver.id)
        assert isinstance(status, AvailablePresentation)
        storage.write.assert_called_once_with(presented_driver.id, presented_driver)

    @pytest.mark.asyncio
    async def test_add_invalid_v1_presentation_rejected(self):
        storage = AsyncMock(spec=DriverStorage)
        registry = DriverRegistry(storage=storage)
        driver = thermostat_presentation_driver(presentation=_broken_presentation())
        with pytest.raises(InvalidError, match=r"missing_attribute.*/bindings/power"):
            await registry.add(driver)
        assert driver.id not in registry.ids
        storage.write.assert_not_called()

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        ("presentation", "code"),
        [
            (_future_presentation(), DiagnosticCode.UNSUPPORTED_VERSION),
            (
                {**load_thermostat_presentation(), "requires": ["layout/1", "magic/1"]},
                DiagnosticCode.UNSUPPORTED_CAPABILITY,
            ),
        ],
        ids=["future_version", "unknown_capability"],
    )
    async def test_add_unsupported_presentation_kept_inert(self, presentation, code):
        registry = DriverRegistry()
        driver = thermostat_presentation_driver(presentation=presentation)
        await registry.add(driver)
        stored = registry.get(driver.id).presentation
        assert stored is not None
        assert stored.document == presentation
        status = registry.presentation_status(driver.id)
        assert isinstance(status, UnavailablePresentation)
        assert _codes(status) == {code}

    def test_status_none_without_presentation(self, driver):
        registry = DriverRegistry({driver.id: driver})
        assert registry.presentation_status(driver.id) is None

    def test_status_unknown_driver(self):
        with pytest.raises(NotFoundError):
            DriverRegistry().presentation_status("nope")

    @pytest.mark.asyncio
    async def test_patch_installs_a_wire_document(self, thermostat_document):
        """The service hands the registry a plain dict (``model_dump``)."""
        storage = AsyncMock(spec=DriverStorage)
        driver = thermostat_presentation_driver()
        driver.presentation = None
        registry = DriverRegistry({driver.id: driver}, storage=storage)
        result = await registry.patch(driver.id, {"presentation": thermostat_document})
        assert isinstance(result.presentation, PresentationEnvelope)
        assert result.presentation.document == thermostat_document
        assert isinstance(
            registry.presentation_status(driver.id), AvailablePresentation
        )
        storage.write.assert_called_once_with(driver.id, driver)

    @pytest.mark.asyncio
    async def test_patch_accepts_an_envelope(
        self, presented_driver, thermostat_envelope
    ):
        registry = DriverRegistry({presented_driver.id: presented_driver})
        result = await registry.patch(
            presented_driver.id, {"presentation": thermostat_envelope}
        )
        assert result.presentation == thermostat_envelope

    @pytest.mark.asyncio
    async def test_patch_invalid_v1_rejected_and_previous_kept(self, presented_driver):
        storage = AsyncMock(spec=DriverStorage)
        registry = DriverRegistry(
            {presented_driver.id: presented_driver}, storage=storage
        )
        before = presented_driver.presentation
        with pytest.raises(InvalidError, match="missing_attribute"):
            await registry.patch(
                presented_driver.id, {"presentation": _broken_presentation()}
            )
        assert presented_driver.presentation is before
        storage.write.assert_not_called()

    @pytest.mark.asyncio
    async def test_patch_malformed_envelope_rejected(self, presented_driver):
        registry = DriverRegistry({presented_driver.id: presented_driver})
        with pytest.raises(InvalidError, match="Invalid presentation envelope"):
            await registry.patch(presented_driver.id, {"presentation": {"page": {}}})

    @pytest.mark.asyncio
    async def test_patch_null_removes(self, presented_driver):
        storage = AsyncMock(spec=DriverStorage)
        registry = DriverRegistry(
            {presented_driver.id: presented_driver}, storage=storage
        )
        result = await registry.patch(presented_driver.id, {"presentation": None})
        assert result.presentation is None
        assert registry.presentation_status(presented_driver.id) is None
        storage.write.assert_called_once()

    @pytest.mark.asyncio
    async def test_patch_unsupported_version_accepted_inert(self, presented_driver):
        registry = DriverRegistry({presented_driver.id: presented_driver})
        result = await registry.patch(
            presented_driver.id, {"presentation": _future_presentation()}
        )
        assert result.presentation is not None
        assert result.presentation.schema_version == 2

    @pytest.mark.asyncio
    async def test_rename_rewrites_bindings_structurally(self, presented_driver):
        storage = AsyncMock(spec=DriverStorage)
        registry = DriverRegistry(
            {presented_driver.id: presented_driver}, storage=storage
        )
        await registry.rename_driver_attribute(
            presented_driver.id, "temperature", "room_temperature"
        )
        assert presented_driver.presentation is not None
        document = presented_driver.presentation.document
        assert document["bindings"]["measured"] == {"attribute": "room_temperature"}
        # Labels that spell the old name are text, not references.
        row = document["page"]["items"][0]["content"]["children"][0]["children"][0]
        assert row["rows"][0]["label"]["default"] == "Temperature"
        assert isinstance(
            registry.presentation_status(presented_driver.id), AvailablePresentation
        )
        storage.write.assert_called_once_with(presented_driver.id, presented_driver)

    @pytest.mark.asyncio
    async def test_rename_leaves_unsupported_version_untouched(self):
        driver = thermostat_presentation_driver(presentation=_future_presentation())
        registry = DriverRegistry({driver.id: driver})
        before = driver.presentation
        await registry.rename_driver_attribute(driver.id, "temperature", "room_temp")
        assert driver.presentation is before

    @pytest.mark.asyncio
    async def test_delete_bound_attribute_allowed_with_visible_fallback(
        self, presented_driver, caplog
    ):
        registry = DriverRegistry({presented_driver.id: presented_driver})
        with caplog.at_level("WARNING", logger="devices_manager.core.driver_registry"):
            await registry.delete_driver_attribute(presented_driver.id, "humidity")
        assert "humidity" not in presented_driver.attributes
        status = registry.presentation_status(presented_driver.id)
        assert isinstance(status, UnavailablePresentation)
        assert _codes(status) == {DiagnosticCode.MISSING_ATTRIBUTE}
        assert any(
            "unavailable after an attribute change" in r.message for r in caplog.records
        )

    @pytest.mark.asyncio
    async def test_patch_attribute_codecs_allowed_with_visible_fallback(
        self, presented_driver
    ):
        """Dropping the option list under a select control is allowed; the
        presentation reports the mismatch instead of blocking the change."""
        registry = DriverRegistry({presented_driver.id: presented_driver})
        await registry.patch_driver_attribute(
            presented_driver.id, "fan_speed", {"codecs": []}
        )
        status = registry.presentation_status(presented_driver.id)
        assert isinstance(status, UnavailablePresentation)
        assert [(d.code, d.path) for d in status.diagnostics] == [
            (DiagnosticCode.TYPE_MISMATCH, "/controls/fan/kind")
        ]

    @pytest.mark.asyncio
    async def test_add_reports_every_diagnostic(self):
        document = _broken_presentation()
        put(document, f"{LAYERS_PATH}/24/action/op", "increment")
        driver = thermostat_presentation_driver(presentation=document)
        with pytest.raises(InvalidError) as excinfo:
            await DriverRegistry().add(driver)
        message = str(excinfo.value)
        assert "[missing_attribute] /bindings/power/attribute" in message
        assert f"[invalid_action] {LAYERS_PATH}/24/action/op" in message
