import asyncio
import threading

import pytest
import pytest_asyncio
from scene_fakes import FakeSceneConverter

from assets import BuildingModelsService
from assets.conversion import ConversionError, ConversionResult
from assets.models import BuildingModelStatus, ModelStorey
from models.errors import (
    InvalidError,
    NotFoundError,
    StorageConnectionError,
    UnsupportedStorageError,
)

pytestmark = pytest.mark.asyncio

_ASSET_ID = "building-1"
_IFC = b"pretend-ifc-payload"


@pytest.fixture
def converter() -> FakeSceneConverter:
    return FakeSceneConverter()


@pytest_asyncio.fixture
async def service(converter: FakeSceneConverter):
    svc = BuildingModelsService(storage_url=None, converter=converter)
    await svc.start()
    try:
        yield svc
    finally:
        if converter.gate is not None:
            converter.gate.set()
        await svc.stop()


_POLL_DEADLINE_S = 5.0


async def _until(produce, ready=bool) -> object:
    """Poll *produce* until *ready* accepts its value; returns that value.

    Conversions land on a worker thread, so a test that needs one to be *in
    flight* has to watch for it rather than assume a number of event-loop
    turns. Gives up after 5 s so a broken expectation fails instead of
    hanging the suite.
    """
    deadline = asyncio.get_running_loop().time() + _POLL_DEADLINE_S
    while True:
        value = produce()
        if asyncio.iscoroutine(value):
            value = await value
        if ready(value):
            return value
        if asyncio.get_running_loop().time() > deadline:
            msg = "condition never became true"
            raise AssertionError(msg)
        await asyncio.sleep(0.01)


class TestLifecycle:
    async def test_start_with_none_url_uses_memory_backend(self):
        svc = BuildingModelsService(None, FakeSceneConverter())
        await svc.start()
        try:
            with pytest.raises(NotFoundError):
                await svc.get(_ASSET_ID)
        finally:
            await svc.stop()

    async def test_stop_is_idempotent(self):
        svc = BuildingModelsService(None, FakeSceneConverter())
        await svc.start()
        await svc.stop()
        await svc.stop()

    async def test_use_before_start_raises(self):
        svc = BuildingModelsService(None, FakeSceneConverter())
        with pytest.raises(RuntimeError, match="start"):
            await svc.get(_ASSET_ID)


class TestStorageURL:
    async def test_unknown_scheme_raises_unsupported(self):
        svc = BuildingModelsService("redis://localhost", FakeSceneConverter())
        with pytest.raises(UnsupportedStorageError):
            await svc.start()

    async def test_postgres_unreachable_raises_connection_error(self):
        svc = BuildingModelsService(
            "postgresql://user:pass@127.0.0.1:1/nope", FakeSceneConverter()
        )
        with pytest.raises(StorageConnectionError):
            await svc.start()


class TestUploadAndConversion:
    async def test_upload_converts_to_ready(self, service, converter):
        model = await service.upload(_ASSET_ID, filename="hq.ifc", data=_IFC)
        assert model.status == BuildingModelStatus.PROCESSING
        assert model.filename == "hq.ifc"
        assert model.ifc_size == len(_IFC)

        await service.wait_for_conversions()

        ready = await service.get(_ASSET_ID)
        assert ready.status == BuildingModelStatus.READY
        assert ready.error is None
        assert ready.glb_size is not None
        assert ready.glb_size > 0
        assert ready.converter_version == converter.version
        assert [s.name for s in ready.storeys] == ["Level 0", "Level 1"]
        assert [s.name for s in ready.spaces] == ["Room 001", "Room 101"]

        assert await service.get_scene(_ASSET_ID) == b"glTF-fake-scene"
        spaces = await service.get_spaces(_ASSET_ID)
        assert [s.name for s in spaces] == ["Room 001", "Room 101"]

    async def test_the_stored_payload_is_what_the_converter_sees(
        self, service, converter
    ):
        await service.upload(_ASSET_ID, filename="hq.ifc", data=_IFC)
        await service.wait_for_conversions()
        assert converter.calls == [_IFC]

    async def test_conversion_error_ends_failed_with_its_own_message(self):
        converter = FakeSceneConverter(
            error=ConversionError("The uploaded file is not a valid IFC file.")
        )
        svc = BuildingModelsService(None, converter)
        await svc.start()
        try:
            await svc.upload(_ASSET_ID, filename="junk.ifc", data=b"garbage")
            await svc.wait_for_conversions()

            model = await svc.get(_ASSET_ID)
            assert model.status == BuildingModelStatus.FAILED
            assert model.error == "The uploaded file is not a valid IFC file."
            with pytest.raises(NotFoundError):
                await svc.get_scene(_ASSET_ID)
        finally:
            await svc.stop()

    async def test_unexpected_crash_ends_failed_without_leaking_internals(self):
        converter = FakeSceneConverter(error=RuntimeError("segfault in libfoo.so"))
        svc = BuildingModelsService(None, converter)
        await svc.start()
        try:
            await svc.upload(_ASSET_ID, filename="hq.ifc", data=_IFC)
            await svc.wait_for_conversions()

            model = await svc.get(_ASSET_ID)
            assert model.status == BuildingModelStatus.FAILED
            assert model.error == "Conversion failed unexpectedly."
        finally:
            await svc.stop()

    async def test_replace_upload_wins(self, service):
        await service.upload(_ASSET_ID, filename="old.ifc", data=b"old")
        await service.upload(_ASSET_ID, filename="new.ifc", data=_IFC)
        await service.wait_for_conversions()

        model = await service.get(_ASSET_ID)
        assert model.filename == "new.ifc"
        assert model.status == BuildingModelStatus.READY

    async def test_upload_rejects_empty_and_oversized(self, service, monkeypatch):
        with pytest.raises(InvalidError, match="empty"):
            await service.upload(_ASSET_ID, filename="e.ifc", data=b"")
        monkeypatch.setattr("assets.building_models_service.MAX_IFC_BYTES", 4)
        with pytest.raises(InvalidError, match="200 MB"):
            await service.upload(_ASSET_ID, filename="big.ifc", data=b"12345")

    async def test_conversion_of_a_deleted_model_publishes_nothing(
        self, service, converter
    ):
        """A conversion outlives its row; publishing anyway would resurrect it."""
        converter.gate = threading.Event()
        await service.upload(_ASSET_ID, filename="hq.ifc", data=_IFC)
        await service.delete(_ASSET_ID)
        converter.gate.set()
        await service.wait_for_conversions()

        with pytest.raises(NotFoundError):
            await service.get(_ASSET_ID)


class TestRegenerate:
    async def test_replays_the_conversion_on_the_stored_ifc(self, service):
        """The scene belongs to the converter that made it, so a model must be
        rebuildable without asking the user for the file again."""
        await service.upload(_ASSET_ID, filename="hq.ifc", data=_IFC)
        await service.wait_for_conversions()
        first = await service.get(_ASSET_ID)

        regenerating = await service.regenerate(_ASSET_ID)
        assert regenerating.status == BuildingModelStatus.PROCESSING
        # The stale scene stops being served rather than sitting behind a
        # "processing" status.
        with pytest.raises(NotFoundError):
            await service.get_scene(_ASSET_ID)

        await service.wait_for_conversions()
        rebuilt = await service.get(_ASSET_ID)
        assert rebuilt.status == BuildingModelStatus.READY
        assert rebuilt.filename == first.filename
        assert rebuilt.glb_size == first.glb_size
        assert [s.name for s in rebuilt.spaces] == [s.name for s in first.spaces]
        assert rebuilt.updated_at >= first.updated_at

    async def test_regenerate_reuses_the_payload_it_never_asked_for_again(
        self, service, converter
    ):
        await service.upload(_ASSET_ID, filename="hq.ifc", data=_IFC)
        await service.wait_for_conversions()
        await service.regenerate(_ASSET_ID)
        await service.wait_for_conversions()

        assert converter.calls == [_IFC, _IFC]

    async def test_regenerate_without_a_model_is_not_found(self, service):
        with pytest.raises(NotFoundError):
            await service.regenerate(_ASSET_ID)

    async def test_regenerate_clears_a_previous_failure(self):
        converter = FakeSceneConverter(error=ConversionError("bad file"))
        svc = BuildingModelsService(None, converter)
        await svc.start()
        try:
            await svc.upload(_ASSET_ID, filename="junk.ifc", data=b"garbage")
            await svc.wait_for_conversions()
            assert (await svc.get(_ASSET_ID)).error is not None

            regenerating = await svc.regenerate(_ASSET_ID)
            assert regenerating.error is None
        finally:
            await svc.stop()


class TestReadAndDelete:
    async def test_get_without_a_model_is_not_found(self, service):
        with pytest.raises(NotFoundError):
            await service.get(_ASSET_ID)

    async def test_get_scene_before_ready_is_not_found(self, service, converter):
        converter.gate = threading.Event()
        await service.upload(_ASSET_ID, filename="hq.ifc", data=_IFC)
        with pytest.raises(NotFoundError, match="ready"):
            await service.get_scene(_ASSET_ID)

    async def test_delete(self, service):
        await service.upload(_ASSET_ID, filename="hq.ifc", data=_IFC)
        await service.wait_for_conversions()
        await service.delete(_ASSET_ID)
        with pytest.raises(NotFoundError):
            await service.get(_ASSET_ID)

    async def test_delete_without_a_model_is_not_found(self, service):
        with pytest.raises(NotFoundError):
            await service.delete(_ASSET_ID)

    async def test_discard_is_silent_about_assets_carrying_no_model(self, service):
        await service.upload(_ASSET_ID, filename="hq.ifc", data=_IFC)
        await service.wait_for_conversions()

        await service.discard([_ASSET_ID, "never-had-one"])

        with pytest.raises(NotFoundError):
            await service.get(_ASSET_ID)

    async def test_discard_of_nothing_touches_nothing(self, service):
        await service.upload(_ASSET_ID, filename="hq.ifc", data=_IFC)
        await service.wait_for_conversions()

        await service.discard([])

        assert (await service.get(_ASSET_ID)).status == BuildingModelStatus.READY


class TestStopDrainsConversions:
    async def test_stop_does_not_wait_for_a_conversion_in_flight(self):
        gate = threading.Event()
        converter = FakeSceneConverter()
        converter.gate = gate
        svc = BuildingModelsService(None, converter)
        await svc.start()
        try:
            await svc.upload(_ASSET_ID, filename="hq.ifc", data=_IFC)
            # Let the task reach the worker thread, where the gate holds it.
            await asyncio.sleep(0)
            await asyncio.wait_for(svc.stop(), timeout=2)
            await svc.stop()  # still idempotent
        finally:
            gate.set()


class TestStaleRebuild:
    async def _ready_model(self, svc) -> None:
        await svc.upload(_ASSET_ID, filename="hq.ifc", data=_IFC)
        await svc.wait_for_conversions()

    async def test_stale_scene_is_rebuilt_after_a_converter_upgrade(
        self, service, converter
    ):
        await self._ready_model(service)
        before = await service.get(_ASSET_ID)
        assert before.status == BuildingModelStatus.READY

        # The converter now emits a newer contract.
        converter.version = before.converter_version + 5
        await service.rebuild_stale_scenes()
        # The existing scene keeps being served while the rebuild runs.
        assert await service.get_scene(_ASSET_ID) == b"glTF-fake-scene"

        await service.wait_for_conversions()
        after = await service.get(_ASSET_ID)
        assert after.status == BuildingModelStatus.READY
        assert after.converter_version == before.converter_version + 5

    async def test_up_to_date_scene_is_left_alone(self, service, converter):
        await self._ready_model(service)
        calls_before = len(converter.calls)

        await service.rebuild_stale_scenes()
        await service.wait_for_conversions()

        assert len(converter.calls) == calls_before

    async def test_an_upload_during_a_rebuild_wins(self, service, converter):
        """A rebuild runs while the API already serves uploads.

        It is not registered among the per-asset conversions, so nothing
        cancels it: publishing its result would put the superseded scene back
        under the newer file, stamped with the current converter version — a
        model that looks up to date and is never rebuilt again.
        """
        await self._ready_model(service)
        before = await service.get(_ASSET_ID)
        converter.calls.clear()

        # The rebuild starts and blocks inside the converter, on that payload
        # alone so the upload behind it is free to overtake it.
        converter.version = before.converter_version + 5
        converter.gate = threading.Event()
        converter.gate_only = _IFC
        await service.rebuild_stale_scenes()
        await _until(lambda: _IFC in converter.calls)

        # A corrected file lands while the rebuild is still converting, and
        # carries a scene of its own so a clobber would be visible.
        converter.results[b"corrected"] = ConversionResult(
            glb=b"glTF-corrected",
            storeys=[ModelStorey(global_id="c0", name="Corrected level")],
            spaces=[],
        )
        await service.upload(_ASSET_ID, filename="corrected.ifc", data=b"corrected")
        await _until(lambda: b"corrected" in converter.calls)
        await _until(
            lambda: service.get(_ASSET_ID),
            ready=lambda m: m.status == BuildingModelStatus.READY,
        )

        # Only now does the rebuild get to publish what it built.
        converter.gate.set()
        await service.wait_for_conversions()

        after = await service.get(_ASSET_ID)
        assert after.filename == "corrected.ifc"
        assert after.ifc_size == len(b"corrected")
        assert after.status == BuildingModelStatus.READY
        # The scene must describe the file the model now holds — not the one
        # the rebuild had started from.
        assert [s.name for s in after.storeys] == ["Corrected level"]
        assert await service.get_scene(_ASSET_ID) == b"glTF-corrected"

    async def test_failed_rebuild_keeps_the_existing_scene(self, service, converter):
        await self._ready_model(service)
        before = await service.get(_ASSET_ID)

        converter.version = before.converter_version + 5
        converter.error = RuntimeError("converter crashed")

        await service.rebuild_stale_scenes()
        await service.wait_for_conversions()

        after = await service.get(_ASSET_ID)
        assert after.status == BuildingModelStatus.READY
        assert after.converter_version == before.converter_version
        assert await service.get_scene(_ASSET_ID) == b"glTF-fake-scene"
