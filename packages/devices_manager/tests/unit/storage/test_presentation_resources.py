"""Durable resource publication and driver pointer CAS, including process crashes."""

import asyncio
import hashlib
import subprocess
import sys
from copy import deepcopy

import pytest
import yaml

from devices_manager.core.presentation.resource import NormalizedImage
from devices_manager.dto.driver_dto import DriverSpec, dto_to_core
from devices_manager.storage.memory import MemoryDevicesStorage
from devices_manager.storage.yaml.core_file_storage import CoreFileStorage
from devices_manager.storage.yaml.presentation_resources import storage_key
from models.errors import ConflictError, NotFoundError


def resource(data: bytes = b"normalized-image") -> NormalizedImage:
    return NormalizedImage(data, 1, 1, hashlib.sha256(data).hexdigest())


def driver(revision: str | None = None):
    result = dto_to_core(
        DriverSpec.model_validate(
            {"id": "demo", "transport": "http", "device_config": [], "attributes": []}
        )
    )
    result.presentation_revision = revision
    return result


@pytest.fixture(params=["memory", "yaml"])
def storage(request, tmp_path):
    return (
        MemoryDevicesStorage()
        if request.param == "memory"
        else CoreFileStorage(tmp_path)
    )


@pytest.mark.asyncio
async def test_resources_idempotent_immutable_and_integrity(storage):
    resources = storage.presentation_resources
    await resources.write_revision("demo", "first", {"asset": resource()})
    await resources.write_revision("demo", "first", {"asset": resource()})
    assert (await resources.read("demo", "first", "asset")).data == b"normalized-image"
    with pytest.raises(ConflictError):
        await resources.write_revision(
            "demo", "first", {"asset": resource(b"different")}
        )
    assert await resources.list_revisions("demo") == ["first"]
    with pytest.raises(NotFoundError):
        await resources.read("demo", "first", "missing")
    with pytest.raises(NotFoundError):
        await resources.read("other", "first", "asset")


@pytest.mark.asyncio
async def test_prune_keeps_current_and_previous(storage):
    resources = storage.presentation_resources
    for revision in ("first", "second", "third"):
        await resources.write_revision(
            "demo", revision, {"asset": resource(revision.encode())}
        )
    await resources.prune("demo", {"second", "third"})
    assert set(await resources.list_revisions("demo")) == {"second", "third"}
    await resources.delete_revision("demo", "second")
    assert await resources.list_revisions("demo") == ["third"]


@pytest.mark.asyncio
async def test_snapshot_cas_rejects_stale_and_creates_once(storage):
    initial = driver("first")
    await storage.drivers.compare_and_swap(initial, None)
    with pytest.raises(ConflictError):
        await storage.drivers.compare_and_swap(driver("second"), None)
    updated = deepcopy(initial)
    updated.presentation_revision = "second"
    await storage.drivers.compare_and_swap(updated, initial)
    with pytest.raises(ConflictError):
        await storage.drivers.compare_and_swap(driver("third"), initial)
    assert (await storage.drivers.read("demo")).presentation_revision == "second"


@pytest.mark.asyncio
async def test_two_writers_only_one_wins(storage):
    initial = driver("first")
    await storage.drivers.write("demo", initial)
    results = await asyncio.gather(
        storage.drivers.compare_and_swap(driver("second"), initial),
        storage.drivers.compare_and_swap(driver("third"), initial),
        return_exceptions=True,
    )
    assert sum(isinstance(result, ConflictError) for result in results) == 1


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "missing", [("created_at",), ("updated_at",), ("created_at", "updated_at")]
)
async def test_replace_legacy_yaml_driver_without_audit_timestamps(tmp_path, missing):
    storage = CoreFileStorage(tmp_path)
    await storage.drivers.write("demo", driver())
    path = tmp_path / "drivers" / "demo.yaml"
    record = yaml.safe_load(path.read_text())
    for field in missing:
        del record[field]
    path.write_text(yaml.safe_dump(record))

    expected = await storage.drivers.read("demo")
    candidate = deepcopy(expected)
    candidate.presentation_revision = "next"
    await storage.drivers.compare_and_swap(candidate, expected)
    restored = await storage.drivers.read("demo")
    assert restored.presentation_revision == "next"
    assert restored.metadata == expected.metadata
    with pytest.raises(ConflictError):
        await storage.drivers.compare_and_swap(driver("stale"), expected)


@pytest.mark.asyncio
async def test_legacy_yaml_snapshot_still_rejects_external_changes(tmp_path):
    storage = CoreFileStorage(tmp_path)
    path = tmp_path / "drivers" / "demo.yaml"
    path.write_text("id: demo\ntransport: http\n")
    expected = await storage.drivers.read("demo")
    path.write_text("id: demo\ntransport: http\nvendor: changed\n")
    with pytest.raises(ConflictError):
        await storage.drivers.compare_and_swap(driver("next"), expected)
    assert (await storage.drivers.read("demo")).metadata.vendor == "changed"


@pytest.mark.asyncio
@pytest.mark.parametrize("field", ["created_at", "updated_at"])
async def test_yaml_snapshot_compares_persisted_audit_timestamps(tmp_path, field):
    storage = CoreFileStorage(tmp_path)
    await storage.drivers.write("demo", driver())
    expected = await storage.drivers.read("demo")
    path = tmp_path / "drivers" / "demo.yaml"
    record = yaml.safe_load(path.read_text())
    record[field] = "2000-01-01T00:00:00Z"
    path.write_text(yaml.safe_dump(record))
    with pytest.raises(ConflictError):
        await storage.drivers.compare_and_swap(driver("next"), expected)


@pytest.mark.asyncio
async def test_resources_round_trip_after_yaml_reload(tmp_path):
    storage = CoreFileStorage(tmp_path)
    await storage.presentation_resources.write_revision(
        "../unsafe", "../revision", {"../asset": resource()}
    )
    reloaded = CoreFileStorage(tmp_path)
    assert (
        await reloaded.presentation_resources.read(
            "../unsafe", "../revision", "../asset"
        )
    ).sha256 == resource().sha256
    assert not (tmp_path.parent / "unsafe").exists()


@pytest.mark.asyncio
async def test_corrupt_resource_fails_closed(tmp_path):
    storage = CoreFileStorage(tmp_path)
    await storage.presentation_resources.write_revision(
        "demo", "first", {"asset": resource()}
    )
    path = (
        tmp_path
        / "presentations"
        / storage_key("demo")
        / storage_key("first")
        / (storage_key("asset") + ".png")
    )
    path.write_bytes(b"corrupt")
    with pytest.raises(NotFoundError):
        await storage.presentation_resources.read("demo", "first", "asset")


# A fresh interpreter exits *without cleanup* immediately after each filesystem
# publication boundary. This tests visible ordering under a real process crash.
CRASH_SCRIPT = r"""
import asyncio
import hashlib
import os
import sys
from pathlib import Path
from devices_manager.core.presentation.resource import NormalizedImage
from devices_manager.storage.yaml.core_file_storage import CoreFileStorage
from devices_manager.storage.yaml import atomic

root, crash_at = Path(sys.argv[1]), int(sys.argv[2])
count = 0
original = Path.replace

def crash_replace(self, target):
    global count
    result = original(self, target)
    count += 1
    if count == crash_at:
        os._exit(77)
    return result

Path.replace = crash_replace
async def run():
    storage = CoreFileStorage(root)
    previous = await storage.drivers.read("demo")
    candidate = await storage.drivers.read("demo")
    candidate.presentation_revision = "second"
    digest = hashlib.sha256(b"new-image").hexdigest()
    image = NormalizedImage(b"new-image", 1, 1, digest)
    await storage.presentation_resources.write_revision(
        "demo", "second", {"asset": image}
    )
    await storage.drivers.compare_and_swap(candidate, previous)
asyncio.run(run())
"""


@pytest.mark.asyncio
@pytest.mark.parametrize("crash_at", [1, 2, 3, 4])
async def test_process_crash_never_activates_partial_resources(tmp_path, crash_at):
    storage = CoreFileStorage(tmp_path)
    await storage.presentation_resources.write_revision(
        "demo", "first", {"asset": resource()}
    )
    await storage.drivers.write("demo", driver("first"))
    result = await asyncio.to_thread(
        subprocess.run,
        [sys.executable, "-c", CRASH_SCRIPT, str(tmp_path), str(crash_at)],
        check=False,
        capture_output=True,
    )
    assert result.returncode == 77, result.stderr
    reloaded = CoreFileStorage(tmp_path)
    active = await reloaded.drivers.read("demo")
    assert active.presentation_revision == ("second" if crash_at == 4 else "first")
    assert (
        await reloaded.presentation_resources.read(
            "demo", active.presentation_revision, "asset"
        )
    ).data == (b"new-image" if crash_at == 4 else b"normalized-image")
    assert (
        await reloaded.presentation_resources.read("demo", "first", "asset")
    ).data == b"normalized-image"
    # The leftover staged files are invisible; retry completes successfully.
    retry = await asyncio.to_thread(
        subprocess.run,
        [sys.executable, "-c", CRASH_SCRIPT, str(tmp_path), "999"],
        check=False,
        capture_output=True,
    )
    assert retry.returncode == 0, retry.stderr
    assert (await reloaded.drivers.read("demo")).presentation_revision == "second"
