"""Assembling a presentation and its files into resources under a content
revision: the thermostat package as shipped, every refusal located, and
the documents this server keeps inert."""

import re
from typing import Any

import pytest

from devices_manager.core.presentation import (
    DiagnosticCode,
    ImageError,
    ImageErrorCode,
    ImageLimits,
    InvalidPresentationError,
    PresentationEnvelope,
    assemble_presentation,
    package_install,
)
from models.errors import InvalidError

from ..fixtures.hostile_packages import (
    THERMOSTAT_ASSET_PATHS,
    pil_png,
    simple_png,
    thermostat_files,
)
from ..fixtures.presentations import put

HEX_SHA256 = re.compile(r"^[0-9a-f]{64}$")
ASSET_IDS = {"bezel", "main_font", "montserrat"}


def envelope_of(document: dict[str, Any]) -> PresentationEnvelope:
    return PresentationEnvelope.model_validate(document)


def located(error: InvalidPresentationError) -> set[tuple[str, str | None]]:
    return {(diagnostic.code, diagnostic.path) for diagnostic in error.diagnostics}


@pytest.fixture
def envelope(thermostat_document) -> PresentationEnvelope:
    return envelope_of(thermostat_document)


class TestThermostatPackage:
    def test_resources_by_asset_id(self, envelope):
        plan = assemble_presentation(envelope, thermostat_files())
        assert set(plan.resources) == ASSET_IDS
        assert all(
            image.width == image.height == 8 for image in plan.resources.values()
        )
        assert plan.diagnostics == []
        assert HEX_SHA256.match(plan.revision)

    def test_revision_is_stable(self, envelope):
        first = assemble_presentation(envelope, thermostat_files())
        second = assemble_presentation(
            envelope_of(envelope.document), thermostat_files()
        )
        assert first.revision == second.revision

    def test_revision_changes_with_an_asset_byte(self, envelope):
        files = thermostat_files()
        changed = {**files, "assets/bezel.png": pil_png(8, 8, color=(1, 2, 3, 255))}
        assert (
            assemble_presentation(envelope, changed).revision
            != assemble_presentation(envelope, files).revision
        )

    def test_revision_changes_with_the_document(self, thermostat_document):
        before = assemble_presentation(
            envelope_of(thermostat_document), thermostat_files()
        )
        put(thermostat_document, "/controls/power/label/default", "Power (changed)")
        after = assemble_presentation(
            envelope_of(thermostat_document), thermostat_files()
        )
        assert before.revision != after.revision

    def test_revision_changes_with_the_normalizer_version(self, envelope, monkeypatch):
        before = assemble_presentation(envelope, thermostat_files()).revision
        monkeypatch.setattr(package_install, "NORMALIZER_VERSION", 2)
        assert assemble_presentation(envelope, thermostat_files()).revision != before

    def test_two_assets_may_share_a_file(self, thermostat_document):
        put(thermostat_document, "/assets/montserrat/path", "assets/bezel.png")
        files = thermostat_files()
        del files["assets/montserrat-16-atlas.png"]
        plan = assemble_presentation(envelope_of(thermostat_document), files)
        assert plan.resources["montserrat"] == plan.resources["bezel"]


class TestFileChecks:
    def test_undeclared_file(self, envelope):
        files = {**thermostat_files(), "assets/extra.png": pil_png(2, 2)}
        with pytest.raises(InvalidPresentationError) as info:
            assemble_presentation(envelope, files)
        assert located(info.value) == {(DiagnosticCode.UNDECLARED_FILE, None)}
        assert "'assets/extra.png' is not declared" in str(info.value)
        assert isinstance(info.value, InvalidError)

    def test_missing_asset(self, envelope):
        files = thermostat_files()
        del files["assets/bezel.png"]
        with pytest.raises(InvalidPresentationError) as info:
            assemble_presentation(envelope, files)
        assert located(info.value) == {
            (DiagnosticCode.MISSING_ASSET, "/assets/bezel/path")
        }

    def test_every_problem_is_reported(self, envelope):
        files = thermostat_files()
        del files["assets/bezel.png"]
        del files["assets/main-font-atlas.png"]
        files["assets/extra.png"] = pil_png(2, 2)
        with pytest.raises(InvalidPresentationError) as info:
            assemble_presentation(envelope, files)
        assert located(info.value) == {
            (DiagnosticCode.MISSING_ASSET, "/assets/bezel/path"),
            (DiagnosticCode.MISSING_ASSET, "/assets/main_font/path"),
            (DiagnosticCode.UNDECLARED_FILE, None),
        }

    def test_no_presentation_refuses_files(self):
        with pytest.raises(InvalidPresentationError) as info:
            assemble_presentation(None, {"assets/x.png": pil_png(2, 2)})
        assert located(info.value) == {(DiagnosticCode.UNDECLARED_FILE, None)}

    def test_no_presentation_and_no_files(self):
        plan = assemble_presentation(None, {})
        assert plan.resources == {}
        assert plan.diagnostics == []
        assert plan.revision == assemble_presentation(None, {}).revision
        assert HEX_SHA256.match(plan.revision)


class TestKeptInert:
    def test_unsupported_version_is_kept(self):
        envelope = envelope_of({"schema_version": 7, "requires": ["warp/3"], "x": 1})
        plan = assemble_presentation(envelope, {})
        assert plan.resources == {}
        assert [d.code for d in plan.diagnostics] == [
            DiagnosticCode.UNSUPPORTED_VERSION
        ]
        assert HEX_SHA256.match(plan.revision)

    def test_unsupported_version_cannot_carry_files(self):
        envelope = envelope_of({"schema_version": 7, "requires": []})
        with pytest.raises(InvalidPresentationError) as info:
            assemble_presentation(envelope, {"assets/x.png": pil_png(2, 2)})
        assert located(info.value) == {(DiagnosticCode.UNDECLARED_FILE, None)}

    def test_unsupported_capability_is_kept_with_its_resources(
        self, thermostat_document
    ):
        thermostat_document["requires"].append("warp/3")
        plan = assemble_presentation(
            envelope_of(thermostat_document), thermostat_files()
        )
        assert set(plan.resources) == ASSET_IDS
        assert [(d.code, d.path) for d in plan.diagnostics] == [
            (DiagnosticCode.UNSUPPORTED_CAPABILITY, "/requires/7")
        ]


class TestRefusals:
    def test_invalid_document_is_located(self, thermostat_document):
        put(thermostat_document, "/page/items/0/content", {"kind": "hologram"})
        with pytest.raises(InvalidPresentationError) as info:
            assemble_presentation(envelope_of(thermostat_document), thermostat_files())
        codes = {d.code for d in info.value.diagnostics}
        assert codes == {DiagnosticCode.INVALID_DOCUMENT}
        # A discriminator mismatch is located at the union field itself.
        assert {d.path for d in info.value.diagnostics} == {"/page/items/0/content"}
        assert str(info.value).startswith("presentation refused: ")

    def test_semantics_are_not_checked_here(self, thermostat_document):
        """Bindings on unknown attributes are the registry's business."""
        put(thermostat_document, "/bindings/power/attribute", "no_such_attribute")
        plan = assemble_presentation(
            envelope_of(thermostat_document), thermostat_files()
        )
        assert set(plan.resources) == ASSET_IDS

    def test_image_error_names_the_file(self, envelope):
        files = {
            **thermostat_files(),
            "assets/bezel.png": simple_png(4100, 4100, b"junk"),
        }
        with pytest.raises(ImageError) as info:
            assemble_presentation(envelope, files)
        assert info.value.code == ImageErrorCode.TOO_LARGE
        assert info.value.path == "assets/bezel.png"

    def test_limits_apply(self, envelope):
        with pytest.raises(ImageError) as info:
            assemble_presentation(
                envelope, thermostat_files(), ImageLimits(max_images=2)
            )
        assert info.value.code == ImageErrorCode.TOO_MANY_IMAGES
        assert len(THERMOSTAT_ASSET_PATHS) == 3
