from unittest.mock import AsyncMock

import pytest

from devices_manager.core.driver.update_strategy import UpdateStrategy
from devices_manager.core.driver_registry import DriverRegistry
from devices_manager.dto import DriverPatch, DriverSpec, driver_to_public
from devices_manager.storage import StorageBackend
from models.errors import NotFoundError


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
        with pytest.raises(ValueError):  # noqa: PT011
            await registry.add(driver_dto)


class TestDriverRegistryPatch:
    @pytest.mark.asyncio
    async def test_patch_vendor(self, driver):
        registry = DriverRegistry({driver.id: driver})
        result = await registry.patch(driver.id, DriverPatch(vendor="Acme"))
        assert result.vendor == "Acme"
        assert result.id == driver.id

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
    async def test_patch_image_src(self, driver):
        registry = DriverRegistry({driver.id: driver})
        result = await registry.patch(
            driver.id, DriverPatch(image_src="https://example.com/device.png")
        )
        assert result.image_src == "https://example.com/device.png"

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
