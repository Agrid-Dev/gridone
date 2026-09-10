# ruff: noqa: SLF001 - runtime identity is the invariant under test
import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from copy import deepcopy
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
import yaml

from devices_manager import DevicesService
from devices_manager.core.device import CoreDevice, DeviceBase
from devices_manager.core.driver import DeviceConfigField, LocalizedText
from devices_manager.core.presentation import PresentationEnvelope
from devices_manager.core.presentation.resources import StoredResource
from devices_manager.dto.driver_dto import core_to_dto
from devices_manager.dto.driver_dto.package_errors import PackageImportError
from devices_manager.dto.presentation_dto import AvailablePresentationResponse
from devices_manager.storage.storage_backend import DevicesManagerStorage
from devices_manager.types import TransportProtocols
from models.errors import ConflictError, NotFoundError

from .core.fixtures.presentations import thermostat_presentation_driver
from .core.fixtures.transport_clients import make_http_transport_client

pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def loaded():
    driver = thermostat_presentation_driver(
        presentation={
            "schema_version": 1,
            "requires": ["layout/1"],
            "assets": {},
            "bindings": {},
            "controls": {},
            "page": {"kind": "attributes"},
        }
    )
    transport = make_http_transport_client()
    device = CoreDevice.from_base(
        DeviceBase(id="device", name="Device", config={}),
        driver=driver,
        transport=transport,
    )
    storage = MagicMock(spec=DevicesManagerStorage)
    for name in ("devices", "drivers", "transports"):
        backend = AsyncMock()
        backend.list_all.return_value = []
        setattr(storage, name, backend)
    storage.presentation_resources = MagicMock()
    storage.presentation_resources.write_revision = AsyncMock()
    storage.presentation_resources.prune = AsyncMock()
    storage.presentation_resources.read = AsyncMock(
        return_value=StoredResource(b"PNG data", "image/png", "digest", 10, 10)
    )
    service = DevicesService(
        drivers={driver.id: driver},
        devices={device.id: device},
        transports={transport.id: transport},
    )
    with patch(
        "devices_manager.service.build_storage", AsyncMock(return_value=storage)
    ):
        await service.load()
    yield service, storage, driver
    await service.stop()


def package(driver, *, title="new"):
    data = core_to_dto(driver).model_dump(
        mode="json", exclude={"presentation_revision"}
    )
    data["presentation"]["page"] = {
        "kind": "section",
        "title": {"default": title},
        "children": [{"kind": "attributes"}],
    }
    return yaml.safe_dump(data).encode()


async def test_document_matches_device_revision(loaded):
    service, _, _ = loaded
    reference = service.get_device("device").presentation_ref
    result = await service.get_device_presentation("device", reference.revision)
    assert isinstance(result, AvailablePresentationResponse)
    assert result.revision == reference.revision
    assert result.assets == {}


@pytest.mark.parametrize("asset", [False, True])
async def test_wrong_revision_refused_before_storage(loaded, asset):
    service, storage, _ = loaded
    operation = (
        service.get_device_presentation_asset("device", "stale", "bezel")
        if asset
        else service.get_device_presentation("device", "stale")
    )
    with pytest.raises(ConflictError, match="revision changed"):
        await operation
    storage.presentation_resources.read.assert_not_awaited()


async def test_missing_device_and_absent_presentation(loaded):
    service, _, driver = loaded
    with pytest.raises(NotFoundError):
        await service.get_device_presentation("missing")
    driver.presentation = None
    with pytest.raises(NotFoundError, match="no presentation"):
        await service.get_device_presentation("device")


async def test_only_declared_assets_are_read_using_resource_pointer(loaded):
    service, storage, driver = loaded
    driver.presentation = PresentationEnvelope.model_validate(
        driver.presentation.document
        | {"assets": {"bezel": {"path": "assets/bezel.png"}}}
    )
    driver.presentation_revision = "resource-pointer"
    revision = service.get_device("device").presentation_ref.revision
    resource = await service.get_device_presentation_asset("device", revision, "bezel")
    assert resource.data == b"PNG data"
    storage.presentation_resources.read.assert_awaited_once_with(
        driver.id, "resource-pointer", "bezel"
    )
    with pytest.raises(NotFoundError):
        await service.get_device_presentation_asset("device", revision, "undeclared")
    assert storage.presentation_resources.read.await_count == 1


async def test_revision_changed_during_resource_read_conflicts(loaded):
    service, storage, driver = loaded
    driver.presentation = PresentationEnvelope.model_validate(
        driver.presentation.document
        | {"assets": {"bezel": {"path": "assets/bezel.png"}}}
    )
    driver.presentation_revision = "resource-pointer"
    revision = service.get_device("device").presentation_ref.revision

    async def read(*_args: object) -> StoredResource:
        driver.presentation_revision = "replacement"
        return StoredResource(b"PNG", "image/png", "digest", 10, 10)

    storage.presentation_resources.read.side_effect = read
    with pytest.raises(ConflictError):
        await service.get_device_presentation_asset("device", revision, "bezel")


async def test_install_updates_devices_and_emits_complete_update(loaded):
    service, storage, driver = loaded
    before = service.get_device("device")
    listener = MagicMock()
    service.add_device_update_listener(listener)
    await service.install_driver_package(driver.id, package(driver), "application/yaml")
    after = service.get_device("device")
    assert after.presentation_ref != before.presentation_ref
    assert after.attributes == before.attributes
    assert after.config == before.config
    listener.assert_called_once()
    assert listener.call_args.args[0].id == "device"
    assert core_to_dto(listener.call_args.args[0].driver) == service.get_driver(
        driver.id
    )
    storage.drivers.compare_and_swap.assert_awaited_once()


@pytest.mark.parametrize("failure", ["storage", "config", "transport"])
async def test_failed_install_keeps_device_contract_and_emits_nothing(loaded, failure):
    service, storage, driver = loaded
    before = service.get_device("device")
    candidate = deepcopy(driver)
    listener = MagicMock()
    service.add_device_update_listener(listener)
    if failure == "storage":
        storage.drivers.compare_and_swap.side_effect = OSError("disk full")
        expected_error = OSError
    elif failure == "config":
        candidate.device_config_required = [
            DeviceConfigField(name="required", required=True)
        ]
        expected_error = PackageImportError
    else:
        candidate.transport = TransportProtocols.MQTT
        expected_error = PackageImportError
    with pytest.raises(expected_error):
        await service.install_driver_package(
            driver.id, package(candidate), "application/yaml"
        )
    assert service.get_device("device") == before
    listener.assert_not_called()


async def test_removed_listener_is_not_called(loaded):
    service, _, driver = loaded
    listener = MagicMock()
    token = service.add_device_update_listener(listener)
    service.remove_device_update_listener(token)
    service.remove_device_update_listener(token)
    await service.install_driver_package(driver.id, package(driver), "application/yaml")
    listener.assert_not_called()


def _presentation_title(device: CoreDevice) -> str:
    envelope = device.driver.presentation
    assert envelope is not None
    page = envelope.document["page"]
    assert isinstance(page, dict)
    label = page.get("title", {})
    assert isinstance(label, dict)
    value = label.get("default", "original")
    assert isinstance(value, str)
    return value


async def test_concurrent_installs_keep_sync_handoff_in_revision_order(
    loaded, monkeypatch
):
    """An old stop suspended in I/O must not restart after a newer installation."""
    service, storage, driver = loaded
    mutex = asyncio.Lock()
    stopped = asyncio.Event()
    release_stop = asyncio.Event()
    second_attempt = asyncio.Event()
    attempts = 0
    active_sync = ["original"]
    notifications = []

    @asynccontextmanager
    async def installation(_driver_id: str) -> AsyncIterator[None]:
        nonlocal attempts
        attempts += 1
        if attempts == 2:
            second_attempt.set()
        async with mutex:
            yield

    async def stop(device: CoreDevice) -> None:
        if _presentation_title(device) == "original":
            stopped.set()
            await release_stop.wait()
        if _presentation_title(device) in active_sync:
            active_sync.remove(_presentation_title(device))

    async def start(device: CoreDevice) -> None:
        active_sync.append(_presentation_title(device))

    storage.presentation_resources.installation = installation
    monkeypatch.setattr(CoreDevice, "stop_sync", stop)
    monkeypatch.setattr(CoreDevice, "start_sync", start)
    monkeypatch.setattr(service, "_running", True)
    service.add_device_update_listener(
        lambda device: notifications.append(_presentation_title(device))
    )
    first_driver = deepcopy(driver)
    first_driver.env = {"revision": "first"}
    second_driver = deepcopy(driver)
    second_driver.env = {"revision": "second"}
    first = asyncio.create_task(
        service.install_driver_package(
            driver.id, package(first_driver, title="first"), "application/yaml"
        )
    )
    await asyncio.wait_for(stopped.wait(), 2)
    second = asyncio.create_task(
        service.install_driver_package(
            driver.id, package(second_driver, title="second"), "application/yaml"
        )
    )
    try:
        await asyncio.wait_for(second_attempt.wait(), 2)
        observed_while_stopping = service.get_driver(driver.id).presentation.document[
            "page"
        ]["title"]["default"]
    finally:
        release_stop.set()
    await asyncio.gather(first, second)
    await asyncio.sleep(0)  # run the scheduled final start_sync task
    assert observed_while_stopping == "first"
    assert (
        service.get_driver(driver.id).presentation.document["page"]["title"]["default"]
        == "second"
    )
    assert active_sync == ["second"]
    assert notifications == ["first", "second"]


@pytest.mark.parametrize("remove", [False, True])
async def test_visual_install_keeps_runtime_and_publishes_only_after_cas(
    loaded, monkeypatch, remove
):
    service, storage, driver = loaded
    device = service._device_registry.get("device")
    attributes = device.attributes
    waiters = device._waiters
    poll_tasks = device._poll_tasks
    original_revision = service.get_device("device").presentation_ref
    stop = AsyncMock()
    start = AsyncMock()
    monkeypatch.setattr(CoreDevice, "stop_sync", stop)
    monkeypatch.setattr(CoreDevice, "start_sync", start)
    monkeypatch.setattr(service, "_running", True)
    data = yaml.safe_load(package(driver))
    data.pop("created_at")
    data.pop("updated_at")
    if remove:
        data.pop("presentation")
    listener = MagicMock()
    service.add_device_update_listener(listener)

    async def cas(*_args: object) -> None:
        await asyncio.sleep(0)
        assert device.driver is driver
        assert service.get_device("device").presentation_ref == original_revision
        listener.assert_not_called()

    storage.drivers.compare_and_swap.side_effect = cas
    poll_release = asyncio.Event()
    waiter = ("temperature", lambda value: value == 22.5, asyncio.Event())
    waiters.append(waiter)
    device.get_attribute("temperature").update_value(22.5)
    async with asyncio.TaskGroup() as tasks:
        poll_task = tasks.create_task(poll_release.wait())
        poll_tasks[None] = poll_task
        try:
            await service.install_driver_package(
                driver.id, yaml.safe_dump(data).encode(), "application/yaml"
            )
            await asyncio.sleep(0)
            assert service._device_registry.get("device") is device
            assert device.attributes is attributes
            assert device._waiters is waiters
            assert device._poll_tasks is poll_tasks
            assert poll_tasks[None] is poll_task
            assert not poll_task.done()
            assert device.get_attribute("temperature").current_value == 22.5
            assert device._waiters[0] is waiter
            assert device.driver is service._driver_registry.get(driver.id)
            assert service.get_device("device").presentation_ref != original_revision
            listener.assert_called_once_with(device)
            stop.assert_not_awaited()
            start.assert_not_awaited()
        finally:
            poll_release.set()


async def test_failed_visual_install_preserves_live_driver_identity(loaded):
    service, storage, driver = loaded
    device = service._device_registry.get("device")
    storage.drivers.compare_and_swap.side_effect = ConflictError("changed")
    with pytest.raises(ConflictError):
        await service.install_driver_package(
            driver.id, package(driver), "application/yaml"
        )
    assert service._device_registry.get("device") is device
    assert device.driver is driver


@pytest.mark.parametrize(
    "change", ["env", "metadata", "attributes", "healthcheck", "strategy"]
)
async def test_contract_change_rebuilds_and_restarts_runtime(
    loaded, monkeypatch, change
):
    service, _, driver = loaded
    device = service._device_registry.get("device")
    candidate = deepcopy(driver)
    if change == "env":
        candidate.env = {"changed": True}
    elif change == "metadata":
        candidate.metadata.vendor = "updated label"
    elif change == "attributes":
        attribute = next(iter(candidate.attributes.values()))
        candidate.attributes[attribute.name] = attribute.model_copy(
            update={"description": LocalizedText(default="new")}
        )
    elif change == "healthcheck":
        candidate.healthcheck.expected_push_interval = 42
    else:
        candidate.update_strategy.polling_interval = 42
    stop = AsyncMock()
    start = AsyncMock()
    monkeypatch.setattr(CoreDevice, "stop_sync", stop)
    monkeypatch.setattr(CoreDevice, "start_sync", start)
    monkeypatch.setattr(service, "_running", True)
    await service.install_driver_package(
        driver.id, package(candidate), "application/yaml"
    )
    await asyncio.sleep(0)
    assert service._device_registry.get("device") is not device
    stop.assert_awaited_once()
    start.assert_awaited_once()
