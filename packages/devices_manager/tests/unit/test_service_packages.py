"""Package lifecycle: validation, resource-first activation, CAS and restoration."""

import asyncio
from copy import deepcopy
from io import BytesIO
from unittest.mock import AsyncMock, patch
from zipfile import ZIP_DEFLATED, ZipFile

import pytest
import pytest_asyncio
import yaml

from devices_manager import DevicesService
from devices_manager.core.presentation.revision import get_presentation_revision
from devices_manager.dto import DeviceCreate
from devices_manager.dto.driver_dto import DriverSpec, core_to_dto
from devices_manager.dto.driver_dto.package_errors import PackageImportError
from devices_manager.dto.transport_dto import HttpTransportCreate
from devices_manager.storage.memory import MemoryDevicesStorage
from models.errors import ConflictError, NotFoundError

from .core.fixtures.hostile_packages import thermostat_files
from .core.fixtures.presentations import thermostat_presentation_driver


def package(label: str = "demo", *, assets: bool = True) -> bytes:
    spec = core_to_dto(thermostat_presentation_driver())
    data = spec.model_dump(
        mode="json", exclude={"created_at", "updated_at", "presentation_revision"}
    )
    data["vendor"] = label
    if not assets:
        data["presentation"] = None
    else:
        data["presentation"]["controls"]["power"]["label"]["default"] = label
    output = BytesIO()
    with ZipFile(output, "w", ZIP_DEFLATED) as archive:
        archive.writestr("driver.yaml", yaml.safe_dump(data))
        if assets:
            for name, value in thermostat_files().items():
                archive.writestr(name, value)
    return output.getvalue()


DRIVER_ID = thermostat_presentation_driver().id


@pytest_asyncio.fixture
async def loaded():
    storage = MemoryDevicesStorage()
    service = DevicesService()
    with patch(
        "devices_manager.service.build_storage", AsyncMock(return_value=storage)
    ):
        await service.load()
    yield service, storage
    await service.stop()


@pytest.mark.asyncio
async def test_install_resources_revision_and_restorable_export(loaded):
    service, storage = loaded
    result = await service.install_driver_package(
        DRIVER_ID, package(), "application/zip"
    )
    assert result.presentation_revision is not None
    assert (
        await service.get_driver_resource(
            DRIVER_ID, result.presentation_revision, "bezel"
        )
    ).media_type == "image/png"
    response = await service.get_driver_presentation_response(DRIVER_ID)
    assert response.status == "available"
    assert response.revision != result.presentation_revision
    export = await service.export_driver_package(DRIVER_ID)
    replacement = await service.install_driver_package(
        DRIVER_ID, export, "application/zip", response.revision
    )
    assert replacement.attributes == result.attributes
    assert replacement.env == result.env
    assert (
        await storage.drivers.read(DRIVER_ID)
    ).presentation_revision == replacement.presentation_revision


@pytest.mark.asyncio
async def test_bare_yaml_no_assets_no_resource_pointer(loaded):
    service, storage = loaded
    payload = b"id: plain\ntransport: http\ndevice_config: []\nattributes: []\n"
    result = await service.install_driver_package("plain", payload, "application/yaml")
    assert result.presentation_revision is None
    assert await service.get_driver_presentation_response("plain") is None
    assert await storage.presentation_resources.list_revisions("plain") == []


@pytest.mark.asyncio
async def test_invalid_package_keeps_driver_and_resources(loaded):
    service, storage = loaded
    before = await service.install_driver_package(
        DRIVER_ID, package(), "application/zip"
    )
    with pytest.raises(PackageImportError):
        await service.install_driver_package(
            DRIVER_ID, b"!!python/object:evil {}", "application/yaml"
        )
    assert service.get_driver(DRIVER_ID) == before
    assert await storage.presentation_resources.list_revisions(DRIVER_ID) == [
        before.presentation_revision
    ]


@pytest.mark.asyncio
async def test_failed_pointer_write_keeps_live_driver_and_previous_resources(loaded):
    service, storage = loaded
    before = await service.install_driver_package(
        DRIVER_ID, package(), "application/zip"
    )
    with (
        patch.object(
            storage.drivers,
            "compare_and_swap",
            AsyncMock(side_effect=OSError("disk full")),
        ),
        pytest.raises(OSError, match="disk full"),
    ):
        await service.install_driver_package(
            DRIVER_ID, package("changed"), "application/zip"
        )
    assert service.get_driver(DRIVER_ID) == before
    assert (
        await storage.drivers.read(DRIVER_ID)
    ).presentation_revision == before.presentation_revision
    assert (
        await storage.presentation_resources.read(
            DRIVER_ID, before.presentation_revision, "bezel"
        )
    ).data


@pytest.mark.asyncio
async def test_resources_failure_never_activates_candidate(loaded):
    service, storage = loaded
    before = await service.install_driver_package(
        DRIVER_ID, package(), "application/zip"
    )
    with (
        patch.object(
            storage.presentation_resources,
            "write_revision",
            AsyncMock(side_effect=OSError("disk full")),
        ),
        pytest.raises(OSError, match="disk full"),
    ):
        await service.install_driver_package(
            DRIVER_ID, package("changed"), "application/zip"
        )
    assert service.get_driver(DRIVER_ID) == before
    assert (
        await storage.drivers.read(DRIVER_ID)
    ).presentation_revision == before.presentation_revision


@pytest.mark.asyncio
async def test_stale_expected_revision_conflicts_before_writing(loaded):
    service, storage = loaded
    before = await service.install_driver_package(
        DRIVER_ID, package(), "application/zip"
    )
    with (
        patch.object(
            storage.presentation_resources, "write_revision", AsyncMock()
        ) as write,
        pytest.raises(ConflictError),
    ):
        await service.install_driver_package(
            DRIVER_ID, package("changed"), "application/zip", "stale"
        )
    write.assert_not_called()
    assert service.get_driver(DRIVER_ID) == before


@pytest.mark.asyncio
async def test_concurrent_same_expected_revision_one_wins(loaded):
    service, _ = loaded
    await service.install_driver_package(DRIVER_ID, package(), "application/zip")
    response = await service.get_driver_presentation_response(DRIVER_ID)
    results = await asyncio.gather(
        *(
            service.install_driver_package(
                DRIVER_ID, package(label), "application/zip", response.revision
            )
            for label in ("one", "two")
        ),
        return_exceptions=True,
    )
    assert sum(isinstance(result, ConflictError) for result in results) == 1
    assert sum(isinstance(result, DriverSpec) for result in results) == 1


@pytest.mark.asyncio
async def test_pruning_retains_exactly_active_and_previous(loaded):
    service, storage = loaded
    revisions = []
    for label in ("one", "two", "three"):
        result = await service.install_driver_package(
            DRIVER_ID, package(label), "application/zip"
        )
        revisions.append(result.presentation_revision)
    assert set(await storage.presentation_resources.list_revisions(DRIVER_ID)) == set(
        revisions[-2:]
    )
    with pytest.raises(NotFoundError):
        await service.get_driver_resource(DRIVER_ID, revisions[0], "bezel")


@pytest.mark.asyncio
async def test_deleting_driver_prunes_its_presentation_resources(loaded):
    service, storage = loaded
    for label in ("first", "second"):
        await service.install_driver_package(
            DRIVER_ID, package(label), "application/zip"
        )
    assert len(await storage.presentation_resources.list_revisions(DRIVER_ID)) == 2
    await service.delete_driver(DRIVER_ID)
    assert await storage.presentation_resources.list_revisions(DRIVER_ID) == []
    with pytest.raises(NotFoundError):
        service.get_driver(DRIVER_ID)


@pytest.mark.asyncio
async def test_resource_cleanup_failure_does_not_fail_committed_deletion(
    loaded, caplog
):
    service, storage = loaded
    await service.install_driver_package(DRIVER_ID, package(), "application/zip")
    with patch.object(
        storage.presentation_resources, "prune", AsyncMock(side_effect=OSError("disk"))
    ):
        await service.delete_driver(DRIVER_ID)
    with pytest.raises(NotFoundError):
        service.get_driver(DRIVER_ID)
    assert "Could not prune presentation revisions" in caplog.text


@pytest.mark.asyncio
async def test_deletion_rechecks_driver_usage_after_waiting_for_installation(loaded):
    service, storage = loaded
    payload = b"id: plain\ntransport: http\ndevice_config: []\nattributes: []\n"
    await service.install_driver_package("plain", payload, "application/yaml")
    transport = await service.add_transport(
        HttpTransportCreate.model_validate(
            {"name": "HTTP", "protocol": "http", "config": {}}
        )
    )
    async with storage.presentation_resources.installation("plain"):
        deletion = asyncio.create_task(service.delete_driver("plain"))
        await asyncio.sleep(0)  # deletion reaches the held installation lock
        assert not deletion.done()
        device = await service.add_device(
            DeviceCreate(config={}, driver_id="plain", transport_id=transport.id)
        )
    with pytest.raises(ConflictError):
        await deletion
    assert service.get_device(device.id).driver_id == service.get_driver("plain").id


@pytest.mark.asyncio
async def test_read_only_resource_revision_cannot_be_forged(loaded):
    service, _ = loaded
    result = await service.install_driver_package(
        DRIVER_ID, package(), "application/zip"
    )
    spec = DriverSpec.model_validate(
        result.model_dump() | {"presentation_revision": "forged"}
    )
    assert spec.presentation_revision is None
    assert (
        "presentation_revision"
        not in DriverSpec.model_json_schema(mode="validation")["properties"]
    )
    assert (
        DriverSpec.model_json_schema(mode="serialization")["properties"][
            "presentation_revision"
        ]["readOnly"]
        is True
    )


def test_revision_changes_with_contract_but_not_metadata():
    driver = thermostat_presentation_driver()
    revision = get_presentation_revision(driver)
    driver.metadata.vendor = "other"
    assert get_presentation_revision(driver) == revision
    changed = deepcopy(driver)
    changed.attributes["temperature"].unit = "K"
    assert get_presentation_revision(changed) != revision
